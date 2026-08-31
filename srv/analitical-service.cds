using { tafe.dealer as db } from '../db/schema';

service AnalyticsService {
    
   // entity Dealers as projection on db.Dealer;
    
    entity DealerTargets as projection on db.DealerTargets;
    
    entity SalesAchievements as projection on db.SalesAchievements;

    entity DealerKPIs as projection on db.DealerKPIs;

    function getDealerAchievement(
        dealerId : UUID,
        month    : Integer,
        year     : Integer
    ) returns {
        dealerId         : UUID;
        targetAmount     : Decimal(15,2);
        actualAmount     : Decimal(15,2);
        achievementPercentage : Decimal(5,2);
    };

    
    function getDealerKPI(
        dealerId : UUID,
        month    : Integer,
        year     : Integer
    ) returns {
        dealerId               : UUID;
        achievementPercentage  : Decimal(5,2);
        performanceScore       : Decimal(5,2);
    };
}