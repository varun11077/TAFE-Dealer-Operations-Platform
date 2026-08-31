const cds = require('@sap/cds');

module.exports = cds.service.impl(async function () {

    const { DealerTargets, SalesAchievements, DealerKPIs } = this.entities;

    this.on('getDealerAchievement', async (req) => {

        const { dealerId, month, year } = req.data;

        if (!dealerId) {
            return req.error(400, 'Dealer ID is required');
        }

        if (!month || month < 1 || month > 12) {
            return req.error(400, 'Month must be between 1 and 12');
        }

        if (!year) {
            return req.error(400, 'Year is required');
        }


        const target = await SELECT.one
            .from(DealerTargets)
            .where({
                dealer_ID: dealerId,
                targetMonth: month,
                targetYear: year
            });

        const achievement = await SELECT.one
            .from(SalesAchievements)
            .where({
                dealer_ID: dealerId,
                achievementMonth: month,
                achievementYear: year
            });

        const targetAmount = target?.targetAmount || 0;
        const actualAmount = achievement?.actualAmount || 0;


        let achievementPercentage = 0;

        if (targetAmount > 0) {
            achievementPercentage =
                (actualAmount / targetAmount) * 100;
        }

        achievementPercentage =
            Number(achievementPercentage.toFixed(2));

        return {
            dealerId: dealerId,
            targetAmount: targetAmount,
            actualAmount: actualAmount,
            achievementPercentage: achievementPercentage
        };
    });


    this.on('getDealerKPI', async (req) => {

        const { dealerId, month, year } = req.data;

        // Validate input
        if (!dealerId) {
            return req.error(400, 'Dealer ID is required');
        }

        if (!month || month < 1 || month > 12) {
            return req.error(400, 'Month must be between 1 and 12');
        }

        if (!year) {
            return req.error(400, 'Year is required');
        }

        const target = await SELECT.one
            .from(DealerTargets)
            .where({
                dealer_ID: dealerId,
                targetMonth: month,
                targetYear: year
            });

        const achievement = await SELECT.one
            .from(SalesAchievements)
            .where({
                dealer_ID: dealerId,
                achievementMonth: month,
                achievementYear: year
            });

        const targetAmount = target?.targetAmount || 0;
        const actualAmount = achievement?.actualAmount || 0;


        let achievementPercentage = 0;

        if (targetAmount > 0) {
            achievementPercentage =
                (actualAmount / targetAmount) * 100;
        }

        achievementPercentage =
            Number(achievementPercentage.toFixed(2));


        const performanceScore =
            Math.min(achievementPercentage, 100);

        return {
            dealerId: dealerId,
            achievementPercentage: achievementPercentage,
            performanceScore: Number(performanceScore.toFixed(2))
        };
    });

});