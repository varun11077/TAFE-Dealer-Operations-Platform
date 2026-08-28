using { tafe.dealer as db } from '../db/schema';

service PricingService @(path: '/pricing') {

    @readonly
    entity Products as projection on db.Products;

    entity PriceMaster as projection on db.PriceMaster;

    @readonly
    entity Regions as projection on db.Regions;

    @readonly
    entity PriceHistory as projection on db.PriceHistory;

    @readonly
    entity PriceExpiryLog as projection on db.PriceExpiryLog;

    action recalculateFinalPrice(ID: UUID) returns {
        ID         : UUID;
        basePrice  : Decimal(15,2);
        discount   : Decimal(15,2);
        tax        : Decimal(15,2);
        finalPrice : Decimal(15,2);
    };

    //  entry point called by SAP Job Scheduler on a cron schedule
    action expirePrices() returns {
        expiredCount : Integer;
        message      : String;
    };

    function getActivePriceCount() returns Integer;
}
