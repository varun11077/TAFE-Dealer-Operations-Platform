const cds = require("@sap/cds");

const { SELECT, UPDATE, INSERT } = cds.ql;

const {
    Dealer,
    PurchaseOrders,
    POLineItems,
    Products,
    DealerDocuments,
    OnboardingApprovals
} = cds.entities("tafe.dealer");

module.exports = cds.service.impl(async function () {


    // CREATE DEALER

    this.before("CREATE", "Dealers", async (req) => {

        let {
            dealerName,
            gstNumber,
            panNumber,
            phone,
            email
        } = req.data;


        if (!dealerName || !dealerName.trim()) {
            return req.reject(400, "Dealer name is mandatory.");
        }

        if (!gstNumber || !gstNumber.trim()) {
            return req.reject(400, "GST number is mandatory.");
        }

        if (!panNumber || !panNumber.trim()) {
            return req.reject(400, "PAN number is mandatory.");
        }

        if (!phone || !phone.trim()) {
            return req.reject(400, "Phone number is mandatory.");
        }


        // Normalize data

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


        // GST validation

        const gstRegex =
            /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

        if (!gstRegex.test(gstNumber)) {
            return req.reject(400, "Invalid GST number format.");
        }


        // PAN validation

        const panRegex =
            /^[A-Z]{5}[0-9]{4}[A-Z]$/;

        if (!panRegex.test(panNumber)) {
            return req.reject(400, "Invalid PAN number format.");
        }


        // Phone validation

        const phoneRegex =
            /^[6-9][0-9]{9}$/;

        if (!phoneRegex.test(phone)) {
            return req.reject(400, "Invalid phone number.");
        }


        // Email validation

        if (email) {

            const emailRegex =
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (!emailRegex.test(email)) {
                return req.reject(400, "Invalid email address.");
            }
        }


        // Duplicate GST

        const gstExists = await SELECT.one
            .from(Dealer)
            .where({
                gstNumber
            });

        if (gstExists) {
            return req.reject(
                409,
                "Dealer with this GST number already exists."
            );
        }


        // Duplicate PAN

        const panExists = await SELECT.one
            .from(Dealer)
            .where({
                panNumber
            });

        if (panExists) {
            return req.reject(
                409,
                "Dealer with this PAN number already exists."
            );
        }


        // Duplicate phone

        const phoneExists = await SELECT.one
            .from(Dealer)
            .where({
                phone
            });

        if (phoneExists) {
            return req.reject(
                409,
                "Dealer with this phone number already exists."
            );
        }


        // Duplicate email

        if (email) {

            const emailExists = await SELECT.one
                .from(Dealer)
                .where({
                    email
                });

            if (emailExists) {
                return req.reject(
                    409,
                    "Dealer with this email already exists."
                );
            }
        }


        // Initial status

        req.data.status = "PENDING";

    });


    // GENERATE DEALER CODE

    this.before("CREATE", "Dealers", async (req) => {

        /*
         * Production / HANA:
         * Use HANA sequence.
         *
         * Local / SQLite:
         * Generate next dealer code from existing records.
         */

        if (cds.db.kind === "hana") {

            // HANA

            const result = await cds.db.run(
                'SELECT "TAFE_DEALER_CODE_SEQ".NEXTVAL AS "NEXT_VALUE" FROM DUMMY'
            );

            const nextValue = result[0].NEXT_VALUE;

            req.data.dealerCode =
                `DLR${String(nextValue).padStart(5, "0")}`;

        } else {

            // SQLite - Local Development

            const result = await SELECT.one
                .from(Dealer)
                .columns("dealerCode")
                .orderBy("dealerCode desc");

            let nextValue = 1;

            if (result && result.dealerCode) {

                const currentNumber = parseInt(
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


    // UPDATE DEALER

    this.before("UPDATE", "Dealers", async (req) => {

        const dealerId = req.params[0].ID;

        const dealer = await SELECT.one
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


        // Dealer code cannot be changed

        if (req.data.dealerCode !== undefined) {
            return req.reject(
                400,
                "Dealer code cannot be modified."
            );
        }


        // Status cannot be changed directly

        if (req.data.status !== undefined) {
            return req.reject(
                400,
                "Dealer status can only be changed through business actions."
            );
        }


        // GST validation

        if (req.data.gstNumber) {

            const gst = req.data.gstNumber
                .trim()
                .toUpperCase();

            const gstRegex =
                /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

            if (!gstRegex.test(gst)) {
                return req.reject(
                    400,
                    "Invalid GST number format."
                );
            }

            req.data.gstNumber = gst;
        }


        // PAN validation

        if (req.data.panNumber) {

            const pan = req.data.panNumber
                .trim()
                .toUpperCase();

            const panRegex =
                /^[A-Z]{5}[0-9]{4}[A-Z]$/;

            if (!panRegex.test(pan)) {
                return req.reject(
                    400,
                    "Invalid PAN number format."
                );
            }

            req.data.panNumber = pan;
        }


        // Phone validation

        if (req.data.phone) {

            const phone = req.data.phone.trim();

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


        // Email validation

        if (req.data.email) {

            const email = req.data.email
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


        // Duplicate GST during UPDATE

        if (req.data.gstNumber) {

            const existingGST = await SELECT.one
                .from(Dealer)
                .where({
                    gstNumber: req.data.gstNumber
                });

            if (existingGST && existingGST.ID !== dealerId) {
                return req.reject(
                    409,
                    "Dealer with this GST number already exists."
                );
            }
        }


        // Duplicate PAN during UPDATE

        if (req.data.panNumber) {

            const existingPAN = await SELECT.one
                .from(Dealer)
                .where({
                    panNumber: req.data.panNumber
                });

            if (existingPAN && existingPAN.ID !== dealerId) {
                return req.reject(
                    409,
                    "Dealer with this PAN number already exists."
                );
            }
        }


        // Duplicate phone during UPDATE

        if (req.data.phone) {

            const existingPhone = await SELECT.one
                .from(Dealer)
                .where({
                    phone: req.data.phone
                });

            if (existingPhone && existingPhone.ID !== dealerId) {
                return req.reject(
                    409,
                    "Dealer with this phone number already exists."
                );
            }
        }


        // Duplicate email during UPDATE

        if (req.data.email) {

            const existingEmail = await SELECT.one
                .from(Dealer)
                .where({
                    email: req.data.email
                });

            if (existingEmail && existingEmail.ID !== dealerId) {
                return req.reject(
                    409,
                    "Dealer with this email already exists."
                );
            }
        }

    });


    // SUBMIT DEALER

    this.on("submitDealer", "Dealers", async (req) => {

        const dealerId = req.params[0].ID;

        const dealer = await SELECT.one
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


        if (dealer.status !== "PENDING") {
            return req.reject(
                400,
                "Only pending dealers can be submitted."
            );
        }


        // Check mandatory documents

        const documents = await SELECT
            .from(DealerDocuments)
            .where({
                dealer_ID: dealerId
            });

        if (!documents || documents.length === 0) {
            return req.reject(
                400,
                "At least one dealer document is required before submission."
            );
        }


        // Change status

        await UPDATE(Dealer)
            .set({
                status: "SUBMITTED"
            })
            .where({
                ID: dealerId
            });


        // Save approval history

        await INSERT.into(OnboardingApprovals).entries({
            dealer_ID: dealerId,
            action: "SUBMITTED",
            level: 0,
            remarks: "Dealer submitted for approval.",
            actionBy: req.user.id || "SYSTEM",
            actionAt: new Date()
        });


        return "Dealer submitted successfully for approval.";

    });


    // L1 APPROVE DEALER

    this.on("l1Approve", "Dealers", async (req) => {

        const dealerId = req.params[0].ID;

        const { remarks } = req.data;


        // Authorization

        // if (
        //     !req.user.is("DealerManager") &&
        //     !req.user.is("Admin")
        // ) {
        //     return req.reject(
        //         403,
        //         "You are not authorized to approve dealers."
        //     );
        // }


        const dealer = await SELECT.one
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


        // Status validation

        if (dealer.status !== "SUBMITTED") {
            return req.reject(
                400,
                "Only submitted dealers can be approved by L1."
            );
        }


        // Update dealer

        await UPDATE(Dealer)
            .set({
                status: "L1_APPROVED",
                remarks: remarks
                    ? remarks.trim()
                    : null
            })
            .where({
                ID: dealerId
            });


        // Save approval history

        await INSERT.into(OnboardingApprovals).entries({
            dealer_ID: dealerId,
            action: "L1_APPROVED",
            level: 1,
            remarks: remarks
                ? remarks.trim()
                : "Dealer approved by L1.",
            actionBy: req.user.id || "SYSTEM",
            actionAt: new Date()
        });


        return "Dealer approved successfully by L1.";

    });


    // L2 APPROVE DEALER

    this.on("l2Approve", "Dealers", async (req) => {

        const dealerId = req.params[0].ID;

        const { remarks } = req.data;


        // Authorization

        // if (
        //     !req.user.is("DealerManager") &&
        //     !req.user.is("Admin")
        // ) {
        //     return req.reject(
        //         403,
        //         "You are not authorized to approve dealers."
        //     );
        // }


        const dealer = await SELECT.one
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


        // Status validation

        if (dealer.status !== "L1_APPROVED") {
            return req.reject(
                400,
                "Only L1-approved dealers can be approved by L2."
            );
        }


        // Update dealer to ACTIVE

        await UPDATE(Dealer)
            .set({
                status: "ACTIVE",
                remarks: remarks
                    ? remarks.trim()
                    : null
            })
            .where({
                ID: dealerId
            });


        // Save approval history

        await INSERT.into(OnboardingApprovals).entries({
            dealer_ID: dealerId,
            action: "L2_APPROVED",
            level: 2,
            remarks: remarks
                ? remarks.trim()
                : "Dealer approved by L2.",
            actionBy: req.user.id || "SYSTEM",
            actionAt: new Date()
        });


        return "Dealer approved successfully by L2.";

    });


    // REJECT DEALER

    this.on("rejectDealer", "Dealers", async (req) => {

        const dealerId = req.params[0].ID;

        const { reason } = req.data;


        // Authorization

        // if (
        //     !req.user.is("DealerManager") &&
        //     !req.user.is("Admin")
        // ) {
        //     return req.reject(
        //         403,
        //         "You are not authorized to reject dealers."
        //     );
        // }


        // Reason validation

        if (!reason || !reason.trim()) {
            return req.reject(
                400,
                "Rejection reason is mandatory."
            );
        }


        const dealer = await SELECT.one
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


        // Dealer can be rejected before final approval

        if (
            dealer.status !== "PENDING" &&
            dealer.status !== "SUBMITTED" &&
            dealer.status !== "L1_APPROVED"
        ) {
            return req.reject(
                400,
                "Dealer cannot be rejected from the current status."
            );
        }


        const rejectionLevel =
            dealer.status === "L1_APPROVED"
                ? 1
                : 0;


        // Update dealer

        await UPDATE(Dealer)
            .set({
                status: "REJECTED",
                remarks: reason.trim()
            })
            .where({
                ID: dealerId
            });


        // Save rejection history

        await INSERT.into(OnboardingApprovals).entries({
            dealer_ID: dealerId,
            action: "REJECTED",
            level: rejectionLevel,
            remarks: reason.trim(),
            actionBy: req.user.id || "SYSTEM",
            actionAt: new Date()
        });


        return "Dealer rejected successfully.";

    });


    // BLOCK DEALER

    this.on("blockDealer", "Dealers", async (req) => {

        const dealerId = req.params[0].ID;

        const { reason, remarks } = req.data;


        // Authorization

        // if (
        //     !req.user.is("DealerManager") &&
        //     !req.user.is("Admin")
        // ) {
        //     return req.reject(
        //         403,
        //         "You are not authorized to block dealers."
        //     );
        // }


        // Reason validation

        if (!reason || !reason.trim()) {
            return req.reject(
                400,
                "Block reason is mandatory."
            );
        }


        const dealer = await SELECT.one
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


        // Only active dealers can be blocked

        if (dealer.status !== "ACTIVE") {
            return req.reject(
                400,
                "Only active dealers can be blocked."
            );
        }


        // Update dealer

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


        // Save block history

        await INSERT.into(OnboardingApprovals).entries({
            dealer_ID: dealerId,
            action: "BLOCKED",
            level: 0,
            remarks:
                reason.trim() +
                (remarks ? " - " + remarks.trim() : ""),
            actionBy: req.user.id || "SYSTEM",
            actionAt: new Date()
        });


        return "Dealer blocked successfully.";

    });


    // DELETE DEALER

    // this.before("DELETE", "Dealers", async (req) => {

    //     return req.reject(
    //         405,
    //         "Dealer deletion is not allowed. Use business status actions."
    //     );

    // });

});