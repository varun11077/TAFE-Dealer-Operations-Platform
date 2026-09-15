const cds = require("@sap/cds");

module.exports = cds.service.impl(async function () {

    const {
        Inventory,
        Warehouses,
        Products
    } = this.entities;

    const { SELECT, UPDATE } = cds.ql;


    // ============================================================
    // AUTO GENERATE WAREHOUSE CODE
    // ============================================================

    this.before("CREATE", "Warehouses", async (req) => {

        if (!req.data.city) {
            return req.reject(
                400,
                "City is mandatory."
            );
        }

        if (!req.data.warehouseName) {
            return req.reject(
                400,
                "Warehouse name is mandatory."
            );
        }

        const cityCode =
            req.data.city
                .trim()
                .replace(/[^a-zA-Z]/g, "")
                .substring(0, 3)
                .toUpperCase();

        if (!cityCode) {
            return req.reject(
                400,
                "Invalid city."
            );
        }


        const existing =
            await SELECT
                .from(Warehouses)
                .columns("warehouseCode")
                .where({
                    city: req.data.city
                });


        let maxNumber = 0;

        existing.forEach((warehouse) => {

            const match =
                String(warehouse.warehouseCode || "")
                    .match(/-(\d+)$/);

            if (match) {
                maxNumber = Math.max(
                    maxNumber,
                    parseInt(match[1], 10)
                );
            }
        });


        const nextNumber =
            String(maxNumber + 1).padStart(3, "0");


        req.data.warehouseCode =
            `WH-${cityCode}-${nextNumber}`;
    });


    // ============================================================
    // RESERVE STOCK
    // ============================================================

    this.on("reserveStock", async (req) => {

        const {
            productID,
            warehouseID,
            quantity
        } = req.data;


        if (!productID) {
            return req.reject(
                400,
                "Product is mandatory."
            );
        }

        if (!warehouseID) {
            return req.reject(
                400,
                "Warehouse is mandatory."
            );
        }

        if (!quantity || quantity <= 0) {
            return req.reject(
                400,
                "Quantity must be greater than zero."
            );
        }


        const stock =
            await SELECT.one
                .from(Inventory)
                .where({
                    product_ID: productID,
                    warehouse_ID: warehouseID
                });


        if (!stock) {
            return req.reject(
                404,
                "Inventory record not found."
            );
        }


        if (stock.availableQuantity < quantity) {
            return req.reject(
                400,
                `Insufficient stock. Available quantity: ${stock.availableQuantity}`
            );
        }


        await UPDATE(Inventory)
            .set({
                availableQuantity:
                    stock.availableQuantity - quantity,

                reservedQuantity:
                    (stock.reservedQuantity || 0) + quantity,

                lastStockUpdate:
                    new Date().toISOString()
            })
            .where({
                ID: stock.ID
            });


        return "Stock reserved successfully.";
    });


    // ============================================================
    // RELEASE STOCK
    // ============================================================

    this.on("releaseStock", async (req) => {

        const {
            productID,
            warehouseID,
            quantity
        } = req.data;


        if (!productID) {
            return req.reject(
                400,
                "Product is mandatory."
            );
        }

        if (!warehouseID) {
            return req.reject(
                400,
                "Warehouse is mandatory."
            );
        }

        if (!quantity || quantity <= 0) {
            return req.reject(
                400,
                "Quantity must be greater than zero."
            );
        }


        const stock =
            await SELECT.one
                .from(Inventory)
                .where({
                    product_ID: productID,
                    warehouse_ID: warehouseID
                });


        if (!stock) {
            return req.reject(
                404,
                "Inventory record not found."
            );
        }


        if ((stock.reservedQuantity || 0) < quantity) {
            return req.reject(
                400,
                "Release quantity exceeds reserved stock."
            );
        }


        await UPDATE(Inventory)
            .set({
                availableQuantity:
                    stock.availableQuantity + quantity,

                reservedQuantity:
                    (stock.reservedQuantity || 0) - quantity,

                lastStockUpdate:
                    new Date().toISOString()
            })
            .where({
                ID: stock.ID
            });


        return "Stock released successfully.";
    });


    // ============================================================
    // GET AVAILABLE STOCK
    // ============================================================

    this.on("getAvailableStock", async (req) => {

        const {
            productID,
            warehouseID
        } = req.data;


        if (!productID) {
            return req.reject(
                400,
                "Product is mandatory."
            );
        }

        if (!warehouseID) {
            return req.reject(
                400,
                "Warehouse is mandatory."
            );
        }


        const stock =
            await SELECT.one
                .from(Inventory)
                .where({
                    product_ID: productID,
                    warehouse_ID: warehouseID
                });


        if (!stock) {
            return 0;
        }


        return stock.availableQuantity || 0;
    });

});