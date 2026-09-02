namespace tafe.dealer;

using { cuid, managed } from '@sap/cds/common';


/* =========================================================
   DEALER STATUS
   ========================================================= */

type DealerStatus : String enum {
    PENDING;
    SUBMITTED;
    L1_APPROVED;
    ACTIVE;
    REJECTED;
    BLOCKED;
    INACTIVE;
}


/* =========================================================
   DEALER TYPE
   ========================================================= */

type DealerType : String enum {
    DEALER;
    DISTRIBUTOR;
    RETAILER;
}


/* =========================================================
   DEALER
   ========================================================= */

entity Dealer : cuid, managed {

    dealerCode : String(20);

    dealerName : String(100) @mandatory;

    gstNumber : String(15) @mandatory;

    panNumber : String(10) @mandatory;

    phone : String(10) @mandatory;

    email : String(100);

    address : String(250);

    city : String(50);

    state : String(50);

    country : String(50);

    dealerType : DealerType;

    status : DealerStatus default 'PENDING';

    blockedReason : String(200);

    remarks : String(500);
    documents : Composition of many DealerDocuments
        on documents.dealer = $self;
    targets       : Association to many DealerTargets
                       on targets.dealer = $self;

    achievements  : Association to many SalesAchievements
                       on achievements.dealer = $self;

    kpis           : Association to many DealerKPIs
                       on kpis.dealer = $self;


    approvalHistory : Composition of many OnboardingApprovals
        on approvalHistory.dealer = $self;
}


/* =========================================================
   DEALER DOCUMENTS
   ========================================================= */

entity DealerDocuments : cuid {

    documentType : String(50);

    fileName : String(100);

    mimeType : String(100);

    dealer : Association to Dealer;
}


/* =========================================================
   DEALER ONBOARDING APPROVAL HISTORY
   ========================================================= */

entity OnboardingApprovals : cuid, managed {

    action : String(30);

    level : Integer;

    remarks : String(500);

    actionBy : String(100);

    actionAt : DateTime;

    dealer : Association to Dealer;
}


/* =========================================================
   PURCHASE ORDERS
   ========================================================= */

entity PurchaseOrders : cuid, managed {

    poNumber : String(30);

    orderDate : Date;

    totalAmount : Decimal(15,2) default 0;

    taxAmount : Decimal(15,2) default 0;

    status : String enum{
            APPROVED;
            PENDING;
            DELIVERED;
            SUBMITTED;
            REJECT
    } ;

    rejectionReason : String(255);

    dealer : Association to Dealer;

    items : Composition of many POLineItems
        on items.purchaseOrder = $self;
}


/* =========================================================
   PO LINE ITEMS
   ========================================================= */

entity POLineItems : cuid {

    quantity : Integer;

    unitPrice : Decimal(15,2);

    lineTotal : Decimal(15,2);

    product : Association to Products;

    purchaseOrder : Association to PurchaseOrders;
}


/* =========================================================
   PRODUCTS
   ========================================================= */

entity Products : cuid, managed {

    productCode : String(20) @mandatory;

    productName : String(100) @mandatory;

    category : String(50);

    active : Boolean default true;

    unitPrice : Decimal(15,2);

    prices : Association to many PriceMaster
        on prices.product = $self;
}


/* =========================================================
   REGIONS
   ========================================================= */

entity Regions : cuid {

    regionCode : String(10) @mandatory;

    regionName : String(50) @mandatory;
}


/* =========================================================
   PRICE MASTER
   ========================================================= */

entity PriceMaster : cuid, managed {

    basePrice : Decimal(15,2) @mandatory;

    discount : Decimal(15,2) default 0;

    tax : Decimal(15,2) default 0;

    finalPrice : Decimal(15,2);

    region : Association to Regions;

    validFrom : Date @mandatory;

    validTo : Date @mandatory;

    status : String(20) default 'ACTIVE';

    product : Association to Products @mandatory;

    history : Association to many PriceHistory
        on history.priceMaster = $self;
}


/* =========================================================
   PRICE HISTORY
   ========================================================= */

entity PriceHistory : cuid {

    priceMaster : Association to PriceMaster;

    oldFinalPrice : Decimal(15,2);

    newFinalPrice : Decimal(15,2);

    changeReason : String(100);

    changedOn : DateTime;

    changedBy : String(100);
}


/* =========================================================
   PRICE EXPIRY LOG
   ========================================================= */

entity PriceExpiryLog : cuid {

    runOn : DateTime;

    expiredCount : Integer;
    details      : LargeString;
    triggeredBy  : String(50); 
}



entity DealerTargets : cuid {
    targetMonth  : Integer;
    targetYear   : Integer;
    targetAmount : Decimal(15,2);

    dealer : Association to Dealer;
}

entity SalesAchievements : cuid {
    achievementMonth : Integer;
    achievementYear  : Integer;
    actualAmount     : Decimal(15,2);

    dealer : Association to Dealer;
}

entity DealerKPIs : cuid {
    achievementPercentage : Decimal(5,2);
    performanceScore      : Decimal(5,2);

    dealer : Association to Dealer;
}
