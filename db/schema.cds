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

entity Products : cuid, managed {
  productCode : String(30);
  name        : String(100);
  unitPrice   : Decimal(15,2); 
}

entity PurchaseOrders : cuid, managed {
  poNumber        : String(30);
  orderDate       : Date;
  totalAmount     : Decimal(15,2) default 0;
  taxAmount       : Decimal(15,2) default 0;
  status          : String(20) default 'DRAFT'; 
  rejectionReason : String(255);
  dealer          : Association to Dealer;
  items           : Composition of many POLineItems on items.purchaseOrder = $self;
}

entity POLineItems : cuid {
  quantity      : Integer;
  unitPrice     : Decimal(15,2);
  lineTotal     : Decimal(15,2);
  product       : Association to Products;
  purchaseOrder : Association to PurchaseOrders;
}
