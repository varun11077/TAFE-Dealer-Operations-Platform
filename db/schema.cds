namespace tafe.dealer;

using { cuid, managed } from '@sap/cds/common';

type DealerStatus : String enum {
    PENDING;
    ACTIVE;
    REJECTED;
    BLOCKED;
    INACTIVE;
}

type DealerType : String enum {
    DEALER;
    DISTRIBUTOR;
    RETAILER;
}

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

    status : DealerStatus;

    blockedReason : String(200);

    remarks : String(500);

    documents : Composition of many DealerDocuments
        on documents.dealer = $self;
}


entity DealerDocuments : cuid {

    documentType : String(50);

    fileName : String(100);

    mimeType : String(100);

    dealer : Association to Dealer;
};

entity Products : cuid, managed {
    productCode : String(20)  @mandatory;
    productName : String(100) @mandatory;
    category    : String(50);
    active      : Boolean default true;

    prices      : Association to many PriceMaster on prices.product = $self;
}

entity Regions : cuid {
    regionCode : String(10) @mandatory;
    regionName : String(50) @mandatory;
}

entity PriceMaster : cuid, managed {
    basePrice  : Decimal(15,2) @mandatory;
    discount   : Decimal(15,2) default 0;  
    tax        : Decimal(15,2) default 0;  
    finalPrice : Decimal(15,2);            

    region     : Association to Regions;
    validFrom  : Date @mandatory;
    validTo    : Date @mandatory;

    status     : String(20) default 'ACTIVE';

    product    : Association to Products @mandatory;

    history    : Association to many PriceHistory on history.priceMaster = $self;
}

entity PriceHistory : cuid {
    priceMaster   : Association to PriceMaster;
    oldFinalPrice : Decimal(15,2);
    newFinalPrice : Decimal(15,2);
    changeReason  : String(100);
    changedOn     : DateTime;
    changedBy     : String(100);
}

entity PriceExpiryLog : cuid {
    runOn        : DateTime;
    expiredCount : Integer;
    details      : LargeString;
    triggeredBy  : String(50); 
}