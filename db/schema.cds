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
}