using { tafe.dealer as db } from '../db/schema';

//@path: '/odata/v4/analytics'
service AnalyticsService {

    /* =====================================================
       ANALYTICS ENTITIES
       ===================================================== */

    entity DealerAnalytics
        as projection on db.DealerAnalytics;

    entity PurchaseOrderAnalytics
        as projection on db.PurchaseOrderAnalytics;

    entity ProductSalesAnalytics
        as projection on db.ProductSalesAnalytics;

    entity PricingAnalytics
        as projection on db.PricingAnalytics;

    entity MonthlyAnalytics
        as projection on db.MonthlyAnalytics;


    /* =====================================================
       ACTIONS
       ===================================================== */

    action calculateAnalytics(
        month : Integer,
        year  : Integer
    ) returns String;


    action calculateCurrentMonthAnalytics()
        returns String;


    action clearAnalytics(
        month : Integer,
        year  : Integer
    ) returns String;
}