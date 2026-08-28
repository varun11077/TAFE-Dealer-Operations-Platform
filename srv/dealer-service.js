const cds = require("@sap/cds");

const { Dealer, PurchaseOrders, POLineItems, Products } = cds.entities("tafe.dealer");

module.exports = cds.service.impl(async function () {

    

    this.before("CREATE", "Dealers", async (req) => {

        let {
            dealerName,
            gstNumber,
            panNumber,
            phone,
            email
        } = req.data;


        if (!dealerName || !dealerName.trim()) {
            return req.reject(
                400,
                "Dealer name is mandatory."
            );
        }

        if (!gstNumber || !gstNumber.trim()) {
            return req.reject(
                400,
                "GST number is mandatory."
            );
        }

        if (!panNumber || !panNumber.trim()) {
            return req.reject(
                400,
                "PAN number is mandatory."
            );
        }

        if (!phone || !phone.trim()) {
            return req.reject(
                400,
                "Phone number is mandatory."
            );
        }


        // --------------------------------------------------------
        // 2. Normalize data
        // --------------------------------------------------------

        dealerName = dealerName.trim();
        gstNumber = gstNumber.trim().toUpperCase();
        panNumber = panNumber.trim().toUpperCase();
        phone = phone.trim();

        if (email) {
            email = email.trim().toLowerCase();
        }

        req.data.dealerName = dealerName;
        req.data.gstNumber = gstNumber;
        req.data.panNumber = panNumber;
        req.data.phone = phone;
        req.data.email = email;


        // --------------------------------------------------------
        // 3. GST validation
        // --------------------------------------------------------

        const gstRegex =
            /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

        if (!gstRegex.test(gstNumber)) {
            return req.reject(
                400,
                "Invalid GST number format."
            );
        }


        // --------------------------------------------------------
        // 4. PAN validation
        // --------------------------------------------------------

        const panRegex =
            /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

        if (!panRegex.test(panNumber)) {
            return req.reject(
                400,
                "Invalid PAN number format."
            );
        }


        // --------------------------------------------------------
        // 5. Phone validation
        // --------------------------------------------------------

        const phoneRegex =
            /^[6-9][0-9]{9}$/;

        if (!phoneRegex.test(phone)) {
            return req.reject(
                400,
                "Invalid phone number."
            );
        }


        // --------------------------------------------------------
        // 6. Email validation
        // --------------------------------------------------------

        if (email) {

            const emailRegex =
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (!emailRegex.test(email)) {
                return req.reject(
                    400,
                    "Invalid email address."
                );
            }
        }


        // --------------------------------------------------------
        // 7. Duplicate GST
        // --------------------------------------------------------

        const gstExists =
            await SELECT.one
                .from(Dealer)
                .where({ gstNumber });

        if (gstExists) {
            return req.reject(
                409,
                "Dealer with this GST number already exists."
            );
        }


        // --------------------------------------------------------
        // 8. Duplicate PAN
        // --------------------------------------------------------

        const panExists =
            await SELECT.one
                .from(Dealer)
                .where({ panNumber });

        if (panExists) {
            return req.reject(
                409,
                "Dealer with this PAN number already exists."
            );
        }


        // --------------------------------------------------------
        // 9. Duplicate phone
        // --------------------------------------------------------

        const phoneExists =
            await SELECT.one
                .from(Dealer)
                .where({ phone });

        if (phoneExists) {
            return req.reject(
                409,
                "Dealer with this phone number already exists."
            );
        }


        // --------------------------------------------------------
        // 10. Duplicate email
        // --------------------------------------------------------

        if (email) {

            const emailExists =
                await SELECT.one
                    .from(Dealer)
                    .where({ email });

            if (emailExists) {
                return req.reject(
                    409,
                    "Dealer with this email already exists."
                );
            }
        }


        // --------------------------------------------------------
        // 11. Initial status
        // --------------------------------------------------------

        req.data.status = "PENDING";
    });


    // ============================================================
    // GENERATE DEALER CODE
    // ============================================================

    this.before("CREATE", "Dealers", async (req) => {

        /*
         * Production / HANA:
         *
         * HANA sequence:
         * TAFE_DEALER_CODE_SEQ
         *
         * 1 -> DLR00001
         * 2 -> DLR00002
         * 3 -> DLR00003
         *
         * Local development:
         * SQLite does not support HANA's DUMMY table or NEXTVAL.
         * Therefore, we generate the next number from existing
         * dealer codes.
         */

        if (cds.db.kind === "hana") {

            // ----------------------------------------------------
            // HANA
            // ----------------------------------------------------

            const result = await cds.db.run(`
                SELECT "TAFE_DEALER_CODE_SEQ".NEXTVAL AS "NEXT_VALUE"
                FROM DUMMY
            `);

            const nextValue = result[0].NEXT_VALUE;

            req.data.dealerCode =
                `DLR${String(nextValue).padStart(5, "0")}`;

        } else {

            // ----------------------------------------------------
            // SQLite - Local Development
            // ----------------------------------------------------

            const result =
                await SELECT.one
                    .from(Dealer)
                    .columns("dealerCode")
                    .orderBy("dealerCode desc");

            let nextValue = 1;

            if (result && result.dealerCode) {

                const currentNumber =
                    parseInt(
                        result.dealerCode.replace("DLR", ""),
                        10
                    );

                if (!isNaN(currentNumber)) {
                    nextValue = currentNumber + 1;
                }
            }

            req.data.dealerCode =
                `DLR${String(nextValue).padStart(5, "0")}`;
        }
    });


    // ============================================================
    // UPDATE DEALER
    // ============================================================

    this.before("UPDATE", "Dealers", async (req) => {

        const dealerId =
            req.params[0].ID;

        const dealer =
            await SELECT.one
                .from(Dealer)
                .where({
                    ID: dealerId
                });

        if (!dealer) {
            return req.reject(
                404,
                "Dealer not found."
            );
        }


        // --------------------------------------------------------
        // Dealer code cannot be changed
        // --------------------------------------------------------

        if (req.data.dealerCode !== undefined) {

            return req.reject(
                400,
                "Dealer code cannot be modified."
            );
        }


        // --------------------------------------------------------
        // Status cannot be changed directly
        // --------------------------------------------------------

        if (req.data.status !== undefined) {

            return req.reject(
                400,
                "Dealer status can only be changed through business actions."
            );
        }


        // --------------------------------------------------------
        // GST validation
        // --------------------------------------------------------

        if (req.data.gstNumber) {

            const gst =
                req.data.gstNumber
                    .trim()
                    .toUpperCase();

            const gstRegex =
                /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

            if (!gstRegex.test(gst)) {

                return req.reject(
                    400,
                    "Invalid GST number format."
                );
            }

            req.data.gstNumber = gst;
        }


        // --------------------------------------------------------
        // PAN validation
        // --------------------------------------------------------

        if (req.data.panNumber) {

            const pan =
                req.data.panNumber
                    .trim()
                    .toUpperCase();

            const panRegex =
                /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

            if (!panRegex.test(pan)) {

                return req.reject(
                    400,
                    "Invalid PAN number format."
                );
            }

            req.data.panNumber = pan;
        }


        // --------------------------------------------------------
        // Phone validation
        // --------------------------------------------------------

        if (req.data.phone) {

            const phone =
                req.data.phone.trim();

            const phoneRegex =
                /^[6-9][0-9]{9}$/;

            if (!phoneRegex.test(phone)) {

                return req.reject(
                    400,
                    "Invalid phone number."
                );
            }

            req.data.phone = phone;
        }


        // --------------------------------------------------------
        // Email normalization and validation
        // --------------------------------------------------------

        if (req.data.email) {

            const email =
                req.data.email
                    .trim()
                    .toLowerCase();

            const emailRegex =
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (!emailRegex.test(email)) {

                return req.reject(
                    400,
                    "Invalid email address."
                );
            }

            req.data.email = email;
        }


        // --------------------------------------------------------
        // Duplicate GST during UPDATE
        // --------------------------------------------------------

        if (req.data.gstNumber) {

            const existingGST =
                await SELECT.one
                    .from(Dealer)
                    .where({
                        gstNumber: req.data.gstNumber
                    });

            if (
                existingGST &&
                existingGST.ID !== dealerId
            ) {
                return req.reject(
                    409,
                    "Dealer with this GST number already exists."
                );
            }
        }


        // --------------------------------------------------------
        // Duplicate PAN during UPDATE
        // --------------------------------------------------------

        if (req.data.panNumber) {

            const existingPAN =
                await SELECT.one
                    .from(Dealer)
                    .where({
                        panNumber: req.data.panNumber
                    });

            if (
                existingPAN &&
                existingPAN.ID !== dealerId
            ) {
                return req.reject(
                    409,
                    "Dealer with this PAN number already exists."
                );
            }
        }


        // --------------------------------------------------------
        // Duplicate phone during UPDATE
        // --------------------------------------------------------

        if (req.data.phone) {

            const existingPhone =
                await SELECT.one
                    .from(Dealer)
                    .where({
                        phone: req.data.phone
                    });

            if (
                existingPhone &&
                existingPhone.ID !== dealerId
            ) {
                return req.reject(
                    409,
                    "Dealer with this phone number already exists."
                );
            }
        }


        // --------------------------------------------------------
        // Duplicate email during UPDATE
        // --------------------------------------------------------

        if (req.data.email) {

            const existingEmail =
                await SELECT.one
                    .from(Dealer)
                    .where({
                        email: req.data.email
                    });

            if (
                existingEmail &&
                existingEmail.ID !== dealerId
            ) {
                return req.reject(
                    409,
                    "Dealer with this email already exists."
                );
            }
        }
    });


    // ============================================================
    // SUBMIT DEALER
    // ============================================================
this.on("submitDealer", "Dealers", async (req) => {

    const dealerId = req.params[0].ID;

    const dealer = await SELECT.one
        .from(Dealer)
        .where({ ID: dealerId });

    if (!dealer) {
        return req.reject(
            404,
            "Dealer not found."
        );
    }

    if (dealer.status !== "PENDING") {
        return req.reject(
            400,
            "Only pending dealers can be submitted."
        );
    }

    await UPDATE(Dealer)
        .set({
            status: "SUBMITTED"
        })
        .where({
            ID: dealerId
        });

    return "Dealer submitted successfully for approval.";
});


    // ============================================================
    // APPROVE DEALER
    // ============================================================

    this.on(
        "approveDealer",
        "Dealers",
        async (req) => {

            const dealerId =
                req.params[0].ID;


            // ----------------------------------------------------
            // Authorization
            // ----------------------------------------------------

            if (
                !req.user.is("DealerManager") &&
                !req.user.is("Admin")
            ) {

                return req.reject(
                    403,
                    "You are not authorized to approve dealers."
                );
            }


            const dealer =
                await SELECT.one
                    .from(Dealer)
                    .where({
                        ID: dealerId
                    });

            if (!dealer) {

                return req.reject(
                    404,
                    "Dealer not found."
                );
            }


            // ----------------------------------------------------
            // Status validation
            // ----------------------------------------------------

            if (
                dealer.status !== "PENDING" &&
                dealer.status !== "SUBMITTED"
            ) {

                return req.reject(
                    400,
                    "Only pending or submitted dealers can be approved."
                );
            }


            // ----------------------------------------------------
            // Update status
            // ----------------------------------------------------

            await UPDATE(Dealer)
                .set({
                    status: "ACTIVE"
                })
                .where({
                    ID: dealerId
                });


            return "Dealer approved successfully.";
        }
    );


    // ============================================================
    // REJECT DEALER
    // ============================================================

    this.on(
        "rejectDealer",
        "Dealers",
        async (req) => {

            const dealerId =
                req.params[0].ID;

            const {
                reason
            } = req.data;


            // ----------------------------------------------------
            // Authorization
            // ----------------------------------------------------

            if (
                !req.user.is("DealerManager") &&
                !req.user.is("Admin")
            ) {

                return req.reject(
                    403,
                    "You are not authorized to reject dealers."
                );
            }


            // ----------------------------------------------------
            // Reason validation
            // ----------------------------------------------------

            if (!reason || !reason.trim()) {

                return req.reject(
                    400,
                    "Rejection reason is mandatory."
                );
            }


            const dealer =
                await SELECT.one
                    .from(Dealer)
                    .where({
                        ID: dealerId
                    });

            if (!dealer) {

                return req.reject(
                    404,
                    "Dealer not found."
                );
            }


            if (
                dealer.status !== "PENDING" &&
                dealer.status !== "SUBMITTED"
            ) {

                return req.reject(
                    400,
                    "Only pending or submitted dealers can be rejected."
                );
            }


            await UPDATE(Dealer)
                .set({
                    status: "REJECTED",
                    remarks: reason.trim()
                })
                .where({
                    ID: dealerId
                });


            return "Dealer rejected successfully.";
        }
    );


    // ============================================================
    // BLOCK DEALER
    // ============================================================

    this.on(
        "blockDealer",
        "Dealers",
        async (req) => {

            const dealerId =
                req.params[0].ID;

            const {
                reason,
                remarks
            } = req.data;


            // ----------------------------------------------------
            // Authorization
            // ----------------------------------------------------

            if (
                !req.user.is("DealerManager") &&
                !req.user.is("Admin")
            ) {

                return req.reject(
                    403,
                    "You are not authorized to block dealers."
                );
            }


            // ----------------------------------------------------
            // Reason validation
            // ----------------------------------------------------

            if (!reason || !reason.trim()) {

                return req.reject(
                    400,
                    "Block reason is mandatory."
                );
            }


            const dealer =
                await SELECT.one
                    .from(Dealer)
                    .where({
                        ID: dealerId
                    });

            if (!dealer) {

                return req.reject(
                    404,
                    "Dealer not found."
                );
            }


            if (dealer.status !== "ACTIVE") {

                return req.reject(
                    400,
                    "Only active dealers can be blocked."
                );
            }


            await UPDATE(Dealer)
                .set({
                    status: "BLOCKED",
                    blockedReason: reason.trim(),
                    remarks: remarks
                        ? remarks.trim()
                        : null
                })
                .where({
                    ID: dealerId
                });


            return "Dealer blocked successfully.";
        }
    );


    // ============================================================
    // DELETE DEALER
    // ============================================================

    this.before(
        "DELETE",
        "Dealers",
        async (req) => {

            return req.reject(
                405,
                "Dealer deletion is not allowed. Use business status actions."
            );
        }
    );


    // ================================================================
    // ================================================================
    //   PURCHASE ORDER MODULE
    // ================================================================
    // ================================================================


    // ============================================================
    // CREATE PURCHASE ORDER
    // ============================================================

    this.before("CREATE", "PurchaseOrders", async (req) => {

        const {
            dealer_ID
        } = req.data;


        // --------------------------------------------------------
        // 1. Mandatory validation
        // --------------------------------------------------------

        if (!dealer_ID) {
            return req.reject(
                400,
                "Dealer is mandatory to create a Purchase Order."
            );
        }


        // --------------------------------------------------------
        // 2. Dealer existence & status check
        // --------------------------------------------------------

        const dealer =
            await SELECT.one
                .from(Dealer)
                .where({
                    ID: dealer_ID
                });

        if (!dealer) {
            return req.reject(
                404,
                `Dealer ${dealer_ID} does not exist.`
            );
        }

        if (dealer.status !== "ACTIVE") {
            return req.reject(
                400,
                `Dealer ${dealer.dealerCode} is not active. Purchase Orders can only be raised for active dealers.`
            );
        }


        // --------------------------------------------------------
        // 3. Defaults
        // --------------------------------------------------------

        req.data.orderDate =
            req.data.orderDate ||
            new Date().toISOString().slice(0, 10);

        req.data.status = "DRAFT";
        req.data.totalAmount = 0;
        req.data.taxAmount = 0;
    });


    // ============================================================
    // GENERATE PO NUMBER
    // ============================================================

    this.before("CREATE", "PurchaseOrders", async (req) => {

        /*
         * Production / HANA:
         *
         * HANA sequence:
         * TAFE_PO_NUMBER_SEQ
         *
         * 1 -> PO00001
         * 2 -> PO00002
         *
         * Local development:
         * SQLite does not support HANA's DUMMY table or NEXTVAL.
         * Therefore, we generate the next number from existing
         * PO numbers.
         */

        if (cds.db.kind === "hana") {

            // ----------------------------------------------------
            // HANA
            // ----------------------------------------------------

            const result = await cds.db.run(`
                SELECT "TAFE_PO_NUMBER_SEQ".NEXTVAL AS "NEXT_VALUE"
                FROM DUMMY
            `);

            const nextValue = result[0].NEXT_VALUE;

            req.data.poNumber =
                `PO${String(nextValue).padStart(5, "0")}`;

        } else {

            // ----------------------------------------------------
            // SQLite - Local Development
            // ----------------------------------------------------

            const result =
                await SELECT.one
                    .from(PurchaseOrders)
                    .columns("poNumber")
                    .orderBy("poNumber desc");

            let nextValue = 1;

            if (result && result.poNumber) {

                const currentNumber =
                    parseInt(
                        result.poNumber.replace("PO", ""),
                        10
                    );

                if (!isNaN(currentNumber)) {
                    nextValue = currentNumber + 1;
                }
            }

            req.data.poNumber =
                `PO${String(nextValue).padStart(5, "0")}`;
        }
    });


    // ============================================================
    // UPDATE PURCHASE ORDER
    // ============================================================

    this.before("UPDATE", "PurchaseOrders", async (req) => {

        const poId =
            req.params[0].ID;

        const po =
            await SELECT.one
                .from(PurchaseOrders)
                .where({
                    ID: poId
                });

        if (!po) {
            return req.reject(
                404,
                "Purchase Order not found."
            );
        }


        // --------------------------------------------------------
        // PO number cannot be changed
        // --------------------------------------------------------

        if (req.data.poNumber !== undefined) {
            return req.reject(
                400,
                "PO number cannot be modified."
            );
        }


        // --------------------------------------------------------
        // Status cannot be changed directly
        // --------------------------------------------------------

        if (req.data.status !== undefined) {
            return req.reject(
                400,
                "Purchase Order status can only be changed through business actions."
            );
        }


        // --------------------------------------------------------
        // Header fields locked once out of DRAFT
        // --------------------------------------------------------

        if (po.status !== "DRAFT") {
            return req.reject(
                400,
                "Purchase Order can only be edited while in DRAFT status."
            );
        }
    });


    // ============================================================
    // CREATE / UPDATE PO LINE ITEMS
    // ============================================================

    this.before(["CREATE", "UPDATE"], "POLineItems", async (req) => {

        const {
            quantity,
            unitPrice,
            product_ID,
            purchaseOrder_ID
        } = req.data;


        // --------------------------------------------------------
        // 1. Quantity / price validation
        // --------------------------------------------------------

        if (quantity == null || quantity <= 0) {
            return req.reject(
                400,
                "Quantity must be greater than zero."
            );
        }

        if (unitPrice == null || unitPrice < 0) {
            return req.reject(
                400,
                "Unit price cannot be negative."
            );
        }


        // --------------------------------------------------------
        // 2. Product existence
        // --------------------------------------------------------

        if (product_ID) {

            const product =
                await SELECT.one
                    .from(Products)
                    .where({
                        ID: product_ID
                    });

            if (!product) {
                return req.reject(
                    404,
                    `Product ${product_ID} does not exist.`
                );
            }
        }


        // --------------------------------------------------------
        // 3. Purchase Order status check
        // --------------------------------------------------------

        if (purchaseOrder_ID) {

            const po =
                await SELECT.one
                    .from(PurchaseOrders)
                    .where({
                        ID: purchaseOrder_ID
                    });

            if (!po) {
                return req.reject(
                    404,
                    `Purchase Order ${purchaseOrder_ID} does not exist.`
                );
            }

            if (po.status !== "DRAFT") {
                return req.reject(
                    400,
                    "Line items can only be modified while the Purchase Order is in DRAFT status."
                );
            }
        }


        // --------------------------------------------------------
        // 4. Line total calculation
        // --------------------------------------------------------

        req.data.lineTotal =
            +(quantity * unitPrice).toFixed(2);
    });


    // ============================================================
    // RECALCULATE PURCHASE ORDER TOTALS
    // ============================================================

    this.after(["CREATE", "UPDATE", "DELETE"], "POLineItems", async (_result, req) => {

        const poId =
            req.data?.purchaseOrder_ID ||
            (req.params?.[0] && req.params[0].purchaseOrder_ID);

        if (!poId) {
            return;
        }

        const items =
            await SELECT
                .from(POLineItems)
                .where({
                    purchaseOrder_ID: poId
                });

        const TAX_RATE = 0.18;

        const totalAmount =
            +items
                .reduce((sum, item) => sum + (item.lineTotal || 0), 0)
                .toFixed(2);

        const taxAmount =
            +(totalAmount * TAX_RATE).toFixed(2);

        await UPDATE(PurchaseOrders)
            .set({
                totalAmount,
                taxAmount
            })
            .where({
                ID: poId
            });
    });


    // ============================================================
    // SUBMIT PURCHASE ORDER
    // ============================================================

    this.on("submitPO", "PurchaseOrders", async (req) => {

        const poId =
            req.params[0].ID;

        const po =
            await SELECT.one
                .from(PurchaseOrders)
                .where({
                    ID: poId
                });

        if (!po) {
            return req.reject(
                404,
                "Purchase Order not found."
            );
        }

        if (po.status !== "DRAFT") {
            return req.reject(
                400,
                "Only a DRAFT Purchase Order can be submitted."
            );
        }

        const items =
            await SELECT
                .from(POLineItems)
                .where({
                    purchaseOrder_ID: poId
                });

        if (!items.length) {
            return req.reject(
                400,
                "Cannot submit a Purchase Order with no line items."
            );
        }

        await UPDATE(PurchaseOrders)
            .set({
                status: "SUBMITTED"
            })
            .where({
                ID: poId
            });

        return "Purchase Order submitted successfully for approval.";
    });


    // ============================================================
    // APPROVE PURCHASE ORDER
    // ============================================================

    this.on(
        "approvePO",
        "PurchaseOrders",
        async (req) => {

            const poId =
                req.params[0].ID;


            // ----------------------------------------------------
            // Authorization
            // ----------------------------------------------------

            if (
                !req.user.is("PurchaseManager") &&
                !req.user.is("Admin")
            ) {

                return req.reject(
                    403,
                    "You are not authorized to approve purchase orders."
                );
            }


            const po =
                await SELECT.one
                    .from(PurchaseOrders)
                    .where({
                        ID: poId
                    });

            if (!po) {

                return req.reject(
                    404,
                    "Purchase Order not found."
                );
            }


            // ----------------------------------------------------
            // Status validation
            // ----------------------------------------------------

            if (po.status !== "SUBMITTED") {

                return req.reject(
                    400,
                    "Only a SUBMITTED Purchase Order can be approved."
                );
            }


            // ----------------------------------------------------
            // Update status
            // ----------------------------------------------------

            await UPDATE(PurchaseOrders)
                .set({
                    status: "APPROVED",
                    rejectionReason: null
                })
                .where({
                    ID: poId
                });


            return "Purchase Order approved successfully.";
        }
    );


    // ============================================================
    // REJECT PURCHASE ORDER
    // ============================================================

    this.on(
        "rejectPO",
        "PurchaseOrders",
        async (req) => {

            const poId =
                req.params[0].ID;

            const {
                reason
            } = req.data;


            // ----------------------------------------------------
            // Authorization
            // ----------------------------------------------------

            if (
                !req.user.is("PurchaseManager") &&
                !req.user.is("Admin")
            ) {

                return req.reject(
                    403,
                    "You are not authorized to reject purchase orders."
                );
            }


            // ----------------------------------------------------
            // Reason validation
            // ----------------------------------------------------

            if (!reason || !reason.trim()) {

                return req.reject(
                    400,
                    "Rejection reason is mandatory."
                );
            }


            const po =
                await SELECT.one
                    .from(PurchaseOrders)
                    .where({
                        ID: poId
                    });

            if (!po) {

                return req.reject(
                    404,
                    "Purchase Order not found."
                );
            }


            if (po.status !== "SUBMITTED") {

                return req.reject(
                    400,
                    "Only a SUBMITTED Purchase Order can be rejected."
                );
            }


            await UPDATE(PurchaseOrders)
                .set({
                    status: "REJECTED",
                    rejectionReason: reason.trim()
                })
                .where({
                    ID: poId
                });


            return "Purchase Order rejected successfully.";
        }
    );


    // ============================================================
    // DELETE PURCHASE ORDER
    // ============================================================

    this.before(
        "DELETE",
        "PurchaseOrders",
        async (req) => {

            const poId =
                req.params[0].ID;

            const po =
                await SELECT.one
                    .from(PurchaseOrders)
                    .where({
                        ID: poId
                    });

            if (po && po.status !== "DRAFT") {

                return req.reject(
                    405,
                    "Only DRAFT purchase orders can be deleted. Use business status actions otherwise."
                );
            }
        }
    );

});
