using {tafe.dealer as db} from '../db/schema';

service PurchaseOrderService {

    entity PurchaseOrders as projection on db.PurchaseOrders
        actions {

            action submitPO() returns String;

            action approvePO() returns String;

            action rejectPO(reason: String(200)) returns String;
        };

    entity POLineItems as projection on db.POLineItems;

    entity Products as projection on db.Products;

    entity Regions as projection on db.Regions;

    entity PriceMaster as projection on db.PriceMaster
        actions {

            action expirePrice() returns String;
        };

    @readonly
    entity PriceHistory as projection on db.PriceHistory;

    @readonly
    entity PriceExpiryLog as projection on db.PriceExpiryLog;

    // Batch job - expires all PriceMaster records whose validTo has passed
    action runPriceExpiryCheck() returns String;
}
