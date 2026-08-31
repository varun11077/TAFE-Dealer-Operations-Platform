using {tafe.dealer as db} from '../db/schema';

service DealerService {


entity Dealers as projection on db.Dealer
    actions {

        action submitDealer() returns String;

        action l1Approve(remarks: String(500)) returns String;

        action l2Approve(remarks: String(500)) returns String;

        action rejectDealer(reason: String(200)) returns String;

        action blockDealer(
            reason: String(200),
            remarks: String(500)
        ) returns String;
    };

entity DealerDocuments as projection on db.DealerDocuments;

entity Products as projection on db.Products;


entity OnboardingApprovals as projection on db.OnboardingApprovals;

}
