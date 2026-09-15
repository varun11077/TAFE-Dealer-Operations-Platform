const cds = require('@sap/cds');
const { uuid } = cds.utils;

/**
 * Implementation for AnalyticsService (service.cds).
 *
 * File naming: CAP auto-wires this by matching the .cds file's basename.
 * If your service definition lives in srv/analytics-service.cds, keep this
 * file as srv/analytics-service.js. If it's srv/service.cds, rename this to
 * srv/service.js.
 */
module.exports = cds.service.impl(async function () {

	const {
		DealerAnalytics,
		PurchaseOrderAnalytics,
		ProductSalesAnalytics,
		PricingAnalytics,
		MonthlyAnalytics
	} = this.entities;

	// db-side entities (not the service projections) - these carry the raw
	// transactional data the analytics figures are computed from.
	const db = await cds.connect.to('db');
	const {
		PurchaseOrders,
		POLineItems,
		PriceMaster,
		PriceHistory
	} = db.entities('tafe.dealer');

	/* =====================================================
	   ACTION HANDLERS
	   ===================================================== */

	this.on('calculateAnalytics', async (req) => {
		const { month, year } = req.data;
		if (!month || month < 1 || month > 12 || !year) {
			req.error(400, `Provide a valid month (1-12) and year, got month=${month}, year=${year}`);
			return;
		}
		return calculateForPeriod(month, year);
	});

	this.on('calculateCurrentMonthAnalytics', async () => {
		const now = new Date();
		return calculateForPeriod(now.getUTCMonth() + 1, now.getUTCFullYear());
	});

	this.on('clearAnalytics', async (req) => {
		const { month, year } = req.data;
		if (!month || !year) {
			req.error(400, 'Provide both month and year to clear');
			return;
		}
		const match = { analyticsMonth: month, analyticsYear: year };
		await Promise.all([
			DELETE.from(DealerAnalytics).where(match),
			DELETE.from(PurchaseOrderAnalytics).where(match),
			DELETE.from(ProductSalesAnalytics).where(match),
			DELETE.from(PricingAnalytics).where(match),
			DELETE.from(MonthlyAnalytics).where(match)
		]);
		return `Cleared analytics for ${month}/${year}`;
	});

	/* =====================================================
	   CORE CALCULATION
	   ===================================================== */

	async function calculateForPeriod(month, year) {
		const { startDate, endDate, startDateTime, endDateTime } = periodBounds(month, year);

		const [pos, lineItems, priceMasterRows, priceHistoryRows] = await Promise.all([
			// PurchaseOrders placed in this month
			SELECT.from(PurchaseOrders)
				.columns('ID', 'dealer_ID', 'status', 'totalAmount', 'taxAmount')
				.where({ orderDate: { '>=': startDate, '<=': endDate } }),

			// line items whose *parent PO* falls in this month (to-one path filter)
			SELECT.from(POLineItems)
				.columns('product_ID', 'quantity', 'unitPrice', 'lineTotal', 'purchaseOrder_ID')
				.where`purchaseOrder.orderDate >= ${startDate} and purchaseOrder.orderDate <= ${endDate}`,

			// current price master snapshot (PriceMaster isn't itself month-scoped,
			// so "this month's pricing" is approximated as the currently ACTIVE rows)
			SELECT.from(PriceMaster)
				.columns('ID', 'product_ID', 'basePrice', 'discount', 'finalPrice')
				.where({ status: 'ACTIVE' }),

			// price changes logged within the month
			SELECT.from(PriceHistory)
				.columns('priceMaster_ID', 'changedOn')
				.where`changedOn >= ${startDateTime} and changedOn <= ${endDateTime}`
		]);

		await Promise.all([
			upsertDealerAnalytics(pos, month, year),
			upsertPurchaseOrderAnalytics(pos, month, year),
			upsertProductSalesAnalytics(lineItems, month, year),
			upsertPricingAnalytics(priceMasterRows, priceHistoryRows, month, year)
		]);

		// Monthly rollup needs the org-wide PO totals + product totals + growth vs
		// last month, so it runs last and reuses what's already been fetched.
		await upsertMonthlyAnalytics(pos, lineItems, priceMasterRows, month, year);

		return `Analytics calculated for ${month}/${year}`;
	}

	/* ---------------- Dealer Analytics ---------------- */

	async function upsertDealerAnalytics(pos, month, year) {
		const byDealer = {};
		for (const po of pos) {
			if (!po.dealer_ID) continue;
			const d = (byDealer[po.dealer_ID] ??= emptyPOTotals());
			accumulatePO(d, po);
		}

		for (const [dealerId, totals] of Object.entries(byDealer)) {
			await upsertOne(
				DealerAnalytics,
				{ dealer_ID: dealerId, analyticsMonth: month, analyticsYear: year },
				{
					...totals,
					averagePOValue: round2(totals.totalPurchaseValue / totals.totalPOCount)
				}
			);
		}
	}

	/* ---------------- Purchase Order Analytics (org-wide) ---------------- */

	async function upsertPurchaseOrderAnalytics(pos, month, year) {
		const totals = pos.reduce((acc, po) => accumulatePO(acc, po), emptyPOTotals());
		await upsertOne(
			PurchaseOrderAnalytics,
			{ analyticsMonth: month, analyticsYear: year },
			{
				...totals,
				averagePOValue: totals.totalPOCount ? round2(totals.totalPurchaseValue / totals.totalPOCount) : 0
			}
		);
	}

	/* ---------------- Product Sales Analytics ---------------- */

	async function upsertProductSalesAnalytics(lineItems, month, year) {
		const byProduct = {};
		for (const li of lineItems) {
			if (!li.product_ID) continue;
			const p = (byProduct[li.product_ID] ??= { totalQuantity: 0, totalSalesValue: 0, poSet: new Set() });
			p.totalQuantity += li.quantity || 0;
			p.totalSalesValue += li.lineTotal || 0;
			p.poSet.add(li.purchaseOrder_ID);
		}

		for (const [productId, p] of Object.entries(byProduct)) {
			await upsertOne(
				ProductSalesAnalytics,
				{ product_ID: productId, analyticsMonth: month, analyticsYear: year },
				{
					totalQuantity: p.totalQuantity,
					totalPOCount: p.poSet.size,
					totalSalesValue: round2(p.totalSalesValue),
					averageUnitPrice: p.totalQuantity ? round2(p.totalSalesValue / p.totalQuantity) : 0
				}
			);
		}
	}

	/* ---------------- Pricing Analytics ---------------- */

	async function upsertPricingAnalytics(priceMasterRows, priceHistoryRows, month, year) {
		const byProduct = {};
		for (const pm of priceMasterRows) {
			if (!pm.product_ID) continue;
			const p = (byProduct[pm.product_ID] ??= { basePrices: [], discounts: [], finalPrices: [], totalDiscountAmount: 0 });
			p.basePrices.push(pm.basePrice || 0);
			p.discounts.push(pm.discount || 0);
			p.finalPrices.push(pm.finalPrice || 0);
			p.totalDiscountAmount += pm.discount || 0;
		}

		// map priceMaster_ID -> product_ID so PriceHistory rows (which only carry
		// a priceMaster reference) can be grouped by product too
		const pmToProduct = Object.fromEntries(priceMasterRows.map((pm) => [pm.ID, pm.product_ID]));
		const changeCountByProduct = {};
		for (const ph of priceHistoryRows) {
			const productId = pmToProduct[ph.priceMaster_ID];
			if (!productId) continue;
			changeCountByProduct[productId] = (changeCountByProduct[productId] || 0) + 1;
		}

		for (const [productId, p] of Object.entries(byProduct)) {
			await upsertOne(
				PricingAnalytics,
				{ product_ID: productId, analyticsMonth: month, analyticsYear: year },
				{
					averageBasePrice: round2(avg(p.basePrices)),
					averageDiscount: round2(avg(p.discounts)),
					averageFinalPrice: round2(avg(p.finalPrices)),
					totalDiscountAmount: round2(p.totalDiscountAmount),
					priceChangeCount: changeCountByProduct[productId] || 0
				}
			);
		}
	}

	/* ---------------- Monthly Analytics (overall rollup) ---------------- */

	async function upsertMonthlyAnalytics(pos, lineItems, priceMasterRows, month, year) {
		const poTotals = pos.reduce((acc, po) => accumulatePO(acc, po), emptyPOTotals());
		const totalQuantity = lineItems.reduce((sum, li) => sum + (li.quantity || 0), 0);

		// NOTE: PriceMaster.discount isn't tied to individual sales - this sums
		// the currently active discount per product as an org-wide approximation,
		// not "discount actually applied to this month's orders". Adjust if your
		// checkout/PO flow starts capturing a per-line discount instead.
		const totalDiscountAmount = priceMasterRows.reduce((sum, pm) => sum + (pm.discount || 0), 0);

		const { prevMonth, prevYear } = previousPeriod(month, year);
		const prevRow = await SELECT.one.from(MonthlyAnalytics).where({ analyticsMonth: prevMonth, analyticsYear: prevYear });
		const salesGrowthPercentage = prevRow && prevRow.totalPurchaseValue
			? round2(((poTotals.totalPurchaseValue - prevRow.totalPurchaseValue) / prevRow.totalPurchaseValue) * 100)
			: 0;

		await upsertOne(
			MonthlyAnalytics,
			{ analyticsMonth: month, analyticsYear: year },
			{
				totalPOCount: poTotals.totalPOCount,
				totalPurchaseValue: round2(poTotals.totalPurchaseValue),
				totalQuantity,
				totalDiscountAmount: round2(totalDiscountAmount),
				totalTaxAmount: round2(poTotals.totalTaxAmount),
				averagePOValue: poTotals.totalPOCount ? round2(poTotals.totalPurchaseValue / poTotals.totalPOCount) : 0,
				salesGrowthPercentage
			}
		);
	}

	/* =====================================================
	   HELPERS
	   ===================================================== */

	function emptyPOTotals() {
		return { totalPOCount: 0, approvedPOCount: 0, rejectedPOCount: 0, deliveredPOCount: 0, totalPurchaseValue: 0, totalTaxAmount: 0 };
	}

	function accumulatePO(acc, po) {
		acc.totalPOCount++;
		if (po.status === 'APPROVED') acc.approvedPOCount++;
		if (po.status === 'REJECT') acc.rejectedPOCount++;
		if (po.status === 'DELIVERED') acc.deliveredPOCount++;
		acc.totalPurchaseValue += po.totalAmount || 0;
		acc.totalTaxAmount += po.taxAmount || 0;
		return acc;
	}

	async function upsertOne(Entity, match, data) {
		const existing = await SELECT.one.from(Entity).where(match);
		if (existing) {
			await UPDATE(Entity).set(data).where(match);
		} else {
			await INSERT.into(Entity).entries({ ID: uuid(), ...match, ...data });
		}
	}

	function periodBounds(month, year) {
		const pad = (n) => String(n).padStart(2, '0');
		const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
		return {
			startDate: `${year}-${pad(month)}-01`,
			endDate: `${year}-${pad(month)}-${pad(lastDay)}`,
			startDateTime: `${year}-${pad(month)}-01T00:00:00Z`,
			endDateTime: `${year}-${pad(month)}-${pad(lastDay)}T23:59:59Z`
		};
	}

	function previousPeriod(month, year) {
		return month === 1 ? { prevMonth: 12, prevYear: year - 1 } : { prevMonth: month - 1, prevYear: year };
	}

	function avg(arr) {
		return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
	}

	function round2(n) {
		return Math.round((n + Number.EPSILON) * 100) / 100;
	}
});