const cds = require("@sap/cds");

const {
    Dealer,
    PurchaseOrders,
    POLineItems,
    Products,
    Regions,
    PriceMaster,
    PriceHistory,
    PriceExpiryLog
} = cds.entities("tafe.dealer");

module.exports = cds.service.impl(async function () {

   
    //   PURCHASE ORDER


   
    // CREATE PURCHASE ORDER

    this.before("CREATE", "PurchaseOrders", async (req) => {

        const {
            dealer_ID
        } = req.data;


        // --------------------------------------------------------
        // 1. Mandatory validation
        // --------------------------------------------------------

        if (!dealer_ID) {
            return req.reject(
                400,
                "Dealer is mandatory to create a Purchase Order."
            );
        }


        // --------------------------------------------------------
        // 2. Dealer existence & status check
        // --------------------------------------------------------

        const dealer =
            await SELECT.one
                .from(Dealer)
                .where({
                    ID: dealer_ID
                });

        if (!dealer) {
            return req.reject(
                404,
                `Dealer ${dealer_ID} does not exist.`
            );
        }

        if (dealer.status !== "ACTIVE") {
            return req.reject(
                400,
                `Dealer ${dealer.dealerCode} is not active. Purchase Orders can only be raised for active dealers.`
            );
        }


        // --------------------------------------------------------
        // 3. Defaults
        // --------------------------------------------------------

        req.data.orderDate =
            req.data.orderDate ||
            new Date().toISOString().slice(0, 10);

        req.data.status = "DRAFT";
        req.data.totalAmount = 0;
        req.data.taxAmount = 0;
    });


    // ============================================================
    // GENERATE PO NUMBER
    // ============================================================

    this.before("CREATE", "PurchaseOrders", async (req) => {

        /*
         * Production / HANA:
         *
         * HANA sequence:
         * TAFE_PO_NUMBER_SEQ
         *
         * 1 -> PO00001
         * 2 -> PO00002
         *
         * Local development:
         * SQLite does not support HANA's DUMMY table or NEXTVAL.
         * Therefore, we generate the next number from existing
         * PO numbers.
         */

        if (cds.db.kind === "hana") {

            // ----------------------------------------------------
            // HANA
            // ----------------------------------------------------

            const result = await cds.db.run(`
                SELECT "TAFE_PO_NUMBER_SEQ".NEXTVAL AS "NEXT_VALUE"
                FROM DUMMY
            `);

            const nextValue = result[0].NEXT_VALUE;

            req.data.poNumber =
                `PO${String(nextValue).padStart(5, "0")}`;

        } else {

            
            // SQLite - Local Development
            // ----------------------------------------------------

            const result =
                await SELECT.one
                    .from(PurchaseOrders)
                    .columns("poNumber")
                    .orderBy("poNumber desc");

            let nextValue = 1;

            if (result && result.poNumber) {

                const currentNumber =
                    parseInt(
                        result.poNumber.replace("PO", ""),
                        10
                    );

                if (!isNaN(currentNumber)) {
                    nextValue = currentNumber + 1;
                }
            }

            req.data.poNumber =
                `PO${String(nextValue).padStart(5, "0")}`;
        }
    });


    // ============================================================
    // UPDATE PURCHASE ORDER
    // ============================================================

    this.before("UPDATE", "PurchaseOrders", async (req) => {

        const poId =
            req.params[0].ID;

        const po =
            await SELECT.one
                .from(PurchaseOrders)
                .where({
                    ID: poId
                });

        if (!po) {
            return req.reject(
                404,
                "Purchase Order not found."
            );
        }


        // --------------------------------------------------------
        // PO number cannot be changed
        // --------------------------------------------------------

        if (req.data.poNumber !== undefined) {
            return req.reject(
                400,
                "PO number cannot be modified."
            );
        }


        // --------------------------------------------------------
        // Status cannot be changed directly
        // --------------------------------------------------------

        if (req.data.status !== undefined) {
            return req.reject(
                400,
                "Purchase Order status can only be changed through business actions."
            );
        }


        // --------------------------------------------------------
        // Header fields locked once out of DRAFT
        // --------------------------------------------------------

        if (po.status !== "DRAFT") {
            return req.reject(
                400,
                "Purchase Order can only be edited while in DRAFT status."
            );
        }
    });


    // ============================================================
    // CREATE / UPDATE PO LINE ITEMS
    // ============================================================

    this.before(["CREATE", "UPDATE"], "POLineItems", async (req) => {

        const {
            quantity,
            product_ID,
            purchaseOrder_ID
        } = req.data;

        let {
            unitPrice
        } = req.data;


        // --------------------------------------------------------
        // 1. Quantity validation
        // --------------------------------------------------------

        if (quantity == null || quantity <= 0) {
            return req.reject(
                400,
                "Quantity must be greater than zero."
            );
        }


        // --------------------------------------------------------
        // 2. Product existence / active check
        // --------------------------------------------------------

        let product = null;

        if (product_ID) {

            product =
                await SELECT.one
                    .from(Products)
                    .where({
                        ID: product_ID
                    });

            if (!product) {
                return req.reject(
                    404,
                    `Product ${product_ID} does not exist.`
                );
            }

            if (!product.active) {
                return req.reject(
                    400,
                    `Product ${product.productCode} is not active.`
                );
            }
        }


        // --------------------------------------------------------
        // 3. Auto-fetch unit price from PriceMaster when not supplied
        // --------------------------------------------------------

        if (unitPrice == null && product_ID) {

            const today =
                new Date().toISOString().slice(0, 10);

            const activePrice =
                await SELECT.one
                    .from(PriceMaster)
                    .where`product_ID = ${product_ID} and status = 'ACTIVE' and validFrom <= ${today} and validTo >= ${today}`;

            if (!activePrice) {
                return req.reject(
                    400,
                    `No active price found for product ${product.productCode}. Please provide unitPrice manually.`
                );
            }

            unitPrice = activePrice.finalPrice;
            req.data.unitPrice = unitPrice;
        }

        if (unitPrice == null || unitPrice < 0) {
            return req.reject(
                400,
                "Unit price cannot be negative."
            );
        }


        // --------------------------------------------------------
        // 4. Purchase Order status check
        // --------------------------------------------------------

        if (purchaseOrder_ID) {

            const po =
                await SELECT.one
                    .from(PurchaseOrders)
                    .where({
                        ID: purchaseOrder_ID
                    });

            if (!po) {
                return req.reject(
                    404,
                    `Purchase Order ${purchaseOrder_ID} does not exist.`
                );
            }

            if (po.status !== "DRAFT") {
                return req.reject(
                    400,
                    "Line items can only be modified while the Purchase Order is in DRAFT status."
                );
            }
        }


        // --------------------------------------------------------
        // 5. Line total calculation
        // --------------------------------------------------------

        req.data.lineTotal =
            +(quantity * unitPrice).toFixed(2);
    });


    // ============================================================
    // RECALCULATE PURCHASE ORDER TOTALS
    // ============================================================

    this.after(["CREATE", "UPDATE", "DELETE"], "POLineItems", async (_result, req) => {

        const poId =
            req.data?.purchaseOrder_ID ||
            (req.params?.[0] && req.params[0].purchaseOrder_ID);

        if (!poId) {
            return;
        }

        const items =
            await SELECT
                .from(POLineItems)
                .where({
                    purchaseOrder_ID: poId
                });

        const TAX_RATE = 0.18;

        const totalAmount =
            +items
                .reduce((sum, item) => sum + (item.lineTotal || 0), 0)
                .toFixed(2);

        const taxAmount =
            +(totalAmount * TAX_RATE).toFixed(2);

        await UPDATE(PurchaseOrders)
            .set({
                totalAmount,
                taxAmount
            })
            .where({
                ID: poId
            });
    });


    // ============================================================
    // SUBMIT PURCHASE ORDER
    // ============================================================

    this.on("submitPO", "PurchaseOrders", async (req) => {

        const poId =
            req.params[0].ID;

        const po =
            await SELECT.one
                .from(PurchaseOrders)
                .where({
                    ID: poId
                });

        if (!po) {
            return req.reject(
                404,
                "Purchase Order not found."
            );
        }

        if (po.status !== "DRAFT") {
            return req.reject(
                400,
                "Only a DRAFT Purchase Order can be submitted."
            );
        }

        const items =
            await SELECT
                .from(POLineItems)
                .where({
                    purchaseOrder_ID: poId
                });

        if (!items.length) {
            return req.reject(
                400,
                "Cannot submit a Purchase Order with no line items."
            );
        }

        await UPDATE(PurchaseOrders)
            .set({
                status: "SUBMITTED"
            })
            .where({
                ID: poId
            });

        return "Purchase Order submitted successfully for approval.";
    });


    // ============================================================
    // APPROVE PURCHASE ORDER
    // ============================================================

    this.on(
        "approvePO",
        "PurchaseOrders",
        async (req) => {

            const poId =
                req.params[0].ID;


            // ----------------------------------------------------
            // Authorization
            // ----------------------------------------------------

            if (
                !req.user.is("PurchaseManager") &&
                !req.user.is("Admin")
            ) {

                return req.reject(
                    403,
                    "You are not authorized to approve purchase orders."
                );
            }


            const po =
                await SELECT.one
                    .from(PurchaseOrders)
                    .where({
                        ID: poId
                    });

            if (!po) {

                return req.reject(
                    404,
                    "Purchase Order not found."
                );
            }


            // ----------------------------------------------------
            // Status validation
            // ----------------------------------------------------

            if (po.status !== "SUBMITTED") {

                return req.reject(
                    400,
                    "Only a SUBMITTED Purchase Order can be approved."
                );
            }


            // ----------------------------------------------------
            // Update status
            // ----------------------------------------------------

            await UPDATE(PurchaseOrders)
                .set({
                    status: "APPROVED",
                    rejectionReason: null
                })
                .where({
                    ID: poId
                });


            return "Purchase Order approved successfully.";
        }
    );


    // ============================================================
    // REJECT PURCHASE ORDER
    // ============================================================

    this.on(
        "rejectPO",
        "PurchaseOrders",
        async (req) => {

            const poId =
                req.params[0].ID;

            const {
                reason
            } = req.data;


            // ----------------------------------------------------
            // Authorization
            // ----------------------------------------------------

            if (
                !req.user.is("PurchaseManager") &&
                !req.user.is("Admin")
            ) {

                return req.reject(
                    403,
                    "You are not authorized to reject purchase orders."
                );
            }


            // ----------------------------------------------------
            // Reason validation
            // ----------------------------------------------------

            if (!reason || !reason.trim()) {

                return req.reject(
                    400,
                    "Rejection reason is mandatory."
                );
            }


            const po =
                await SELECT.one
                    .from(PurchaseOrders)
                    .where({
                        ID: poId
                    });

            if (!po) {

                return req.reject(
                    404,
                    "Purchase Order not found."
                );
            }


            if (po.status !== "SUBMITTED") {

                return req.reject(
                    400,
                    "Only a SUBMITTED Purchase Order can be rejected."
                );
            }


            await UPDATE(PurchaseOrders)
                .set({
                    status: "REJECTED",
                    rejectionReason: reason.trim()
                })
                .where({
                    ID: poId
                });


            return "Purchase Order rejected successfully.";
        }
    );


    // ============================================================
    // DELETE PURCHASE ORDER
    // ============================================================

    this.before(
        "DELETE",
        "PurchaseOrders",
        async (req) => {

            const poId =
                req.params[0].ID;

            const po =
                await SELECT.one
                    .from(PurchaseOrders)
                    .where({
                        ID: poId
                    });

            if (po && po.status !== "DRAFT") {

                return req.reject(
                    405,
                    "Only DRAFT purchase orders can be deleted. Use business status actions otherwise."
                );
            }
        }
    );


    // ================================================================
    // ================================================================
    //   PRICE MASTER
    // ================================================================
    // ================================================================


    // ============================================================
    // CREATE / UPDATE PRICE MASTER
    // ============================================================

    this.before(["CREATE", "UPDATE"], "PriceMaster", async (req) => {

        const priceId =
            req.params[0] && req.params[0].ID;

        let existing = null;

        if (priceId) {

            existing =
                await SELECT.one
                    .from(PriceMaster)
                    .where({
                        ID: priceId
                    });

            if (!existing) {
                return req.reject(
                    404,
                    "Price record not found."
                );
            }
        }


        // --------------------------------------------------------
        // 1. Product existence
        // --------------------------------------------------------

        const productId =
            req.data.product_ID ||
            (existing && existing.product_ID);

        if (req.data.product_ID) {

            const product =
                await SELECT.one
                    .from(Products)
                    .where({
                        ID: req.data.product_ID
                    });

            if (!product) {
                return req.reject(
                    404,
                    `Product ${req.data.product_ID} does not exist.`
                );
            }
        }


        // --------------------------------------------------------
        // 2. Numeric field validation
        // --------------------------------------------------------

        const basePrice =
            req.data.basePrice ??
            (existing ? existing.basePrice : undefined);

        const discount =
            req.data.discount ??
            (existing ? existing.discount : 0);

        const tax =
            req.data.tax ??
            (existing ? existing.tax : 0);

        if (basePrice == null || basePrice < 0) {
            return req.reject(
                400,
                "Base price is mandatory and cannot be negative."
            );
        }

        if (discount < 0) {
            return req.reject(
                400,
                "Discount cannot be negative."
            );
        }

        if (tax < 0) {
            return req.reject(
                400,
                "Tax cannot be negative."
            );
        }


        // --------------------------------------------------------
        // 3. Validity period check
        // --------------------------------------------------------

        const validFrom =
            req.data.validFrom ??
            (existing ? existing.validFrom : undefined);

        const validTo =
            req.data.validTo ??
            (existing ? existing.validTo : undefined);

        if (validFrom && validTo && validFrom > validTo) {
            return req.reject(
                400,
                "Valid From date cannot be after Valid To date."
            );
        }


        // --------------------------------------------------------
        // 4. Compute final price
        // --------------------------------------------------------

        req.data.finalPrice =
            +((basePrice - discount) + tax).toFixed(2);


        // --------------------------------------------------------
        // 5. Track old value for history logging (see after handler)
        // --------------------------------------------------------

        if (existing) {
            req._priceHistoryContext = {
                priceId,
                oldFinalPrice: existing.finalPrice
            };
        }
    });


    // ============================================================
    // LOG PRICE HISTORY ON UPDATE
    // ============================================================

    this.after("UPDATE", "PriceMaster", async (data, req) => {

        const context = req._priceHistoryContext;

        if (!context) {
            return;
        }

        if (context.oldFinalPrice === data.finalPrice) {
            return;
        }

        await INSERT.into(PriceHistory).entries({
            priceMaster_ID : context.priceId,
            oldFinalPrice  : context.oldFinalPrice,
            newFinalPrice  : data.finalPrice,
            changeReason   : "Price updated",
            changedOn      : new Date().toISOString(),
            changedBy      : (req.user && req.user.id) || "SYSTEM"
        });
    });


    // ============================================================
    // EXPIRE PRICE (manual, single record)
    // ============================================================

    this.on("expirePrice", "PriceMaster", async (req) => {

        const priceId =
            req.params[0].ID;

        const price =
            await SELECT.one
                .from(PriceMaster)
                .where({
                    ID: priceId
                });

        if (!price) {
            return req.reject(
                404,
                "Price record not found."
            );
        }

        if (price.status !== "ACTIVE") {
            return req.reject(
                400,
                "Only ACTIVE price records can be expired."
            );
        }

        await UPDATE(PriceMaster)
            .set({
                status: "EXPIRED"
            })
            .where({
                ID: priceId
            });

        await INSERT.into(PriceHistory).entries({
            priceMaster_ID : priceId,
            oldFinalPrice  : price.finalPrice,
            newFinalPrice  : price.finalPrice,
            changeReason   : "Manually expired",
            changedOn      : new Date().toISOString(),
            changedBy      : (req.user && req.user.id) || "SYSTEM"
        });

        return "Price record expired successfully.";
    });


   
    // RUN PRICE EXPIRY CHECK (batch job - unbound action)
   

    this.on("runPriceExpiryCheck", async (req) => {

        const today =
            new Date().toISOString().slice(0, 10);

        const expiredRecords =
            await SELECT
                .from(PriceMaster)
                .where`status = 'ACTIVE' and validTo < ${today}`;

        for (const record of expiredRecords) {

            await UPDATE(PriceMaster)
                .set({
                    status: "EXPIRED"
                })
                .where({
                    ID: record.ID
                });
        }

        await INSERT.into(PriceExpiryLog).entries({
            runOn        : new Date().toISOString(),
            expiredCount : expiredRecords.length,
            details      : `Expired ${expiredRecords.length} price record(s) with validTo before ${today}.`,
            triggeredBy  : (req.user && req.user.id) || "SYSTEM"
        });

        return `Price expiry check completed. ${expiredRecords.length} record(s) expired.`;
    });

});