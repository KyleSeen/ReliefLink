// routes/donor.js — Donor dashboard route
//   1) Pledge Donations   (donations table — full CRUD)
//   2) Resource-Need Dashboard (shelters table — read-only, shows where help is needed)
// Owner: Yap Sin Ni
const express = require('express');
const { requireLogin, requireRole } = require('../middleware/auth');
const db = require('../config/db');

const router = express.Router();

// Every route here requires being logged in AS a donor.
const guard = [requireLogin, requireRole('donor')];

// ---------------------------------------------------------------
// DASHBOARD — loads donor's own donations + shelter need data
// ---------------------------------------------------------------
router.get('/dashboard', guard, async (req, res) => {
    try {
        const userId = req.session.user.id;

        const [donations] = await db.query(
            'SELECT * FROM donations WHERE user_id = ? ORDER BY created_at DESC, id DESC',
            [userId]
        );

        // Resource-need dashboard: shows shelters with least spots left first
        const [shelters] = await db.query(
            `SELECT *, (capacity - current_occupancy) AS spots_left
         FROM shelters
        ORDER BY spots_left ASC`
        );

        res.render('dashboards/donor', {
            donations,
            shelters,
            ok: req.query.ok || null,
            err: req.query.err || null,
            tab: req.query.tab === 'shelters' ? 'shelters' : 'donations',
        });
    } catch (e) {
        console.error('Donor dashboard error:', e);
        res.render('dashboards/donor', {
            donations: [], shelters: [],
            ok: null, err: 'Could not load data. Is the database running?', tab: 'donations',
        });
    }
});

// ===============================================================
// FEATURE 1 — PLEDGE DONATIONS (full CRUD)
// ===============================================================

// CREATE — pledge a new donation
router.post('/donations', guard, async (req, res) => {
    const userId = req.session.user.id;
    const itemType = (req.body.item_type || '').trim();
    const quantity = parseInt(req.body.quantity, 10);

    if (!itemType || Number.isNaN(quantity) || quantity <= 0) {
        return res.redirect('/donor/dashboard?tab=donations&err=' +
            encodeURIComponent('Enter an item type and a quantity greater than 0.'));
    }
    try {
        await db.query(
            "INSERT INTO donations (user_id, item_type, quantity, status) VALUES (?, ?, ?, 'pledged')",
            [userId, itemType, quantity]
        );
        res.redirect('/donor/dashboard?tab=donations&ok=' + encodeURIComponent('Donation pledged. Thank you!'));
    } catch (e) {
        console.error('Create donation error:', e);
        res.redirect('/donor/dashboard?tab=donations&err=' + encodeURIComponent('Could not save pledge.'));
    }
});

// UPDATE — edit quantity/item type while still pledged (not yet received)
router.post('/donations/:id/update', guard, async (req, res) => {
    const userId = req.session.user.id;
    const id = parseInt(req.params.id, 10);
    const itemType = (req.body.item_type || '').trim();
    const quantity = parseInt(req.body.quantity, 10);

    if (Number.isNaN(id) || !itemType || Number.isNaN(quantity) || quantity <= 0) {
        return res.redirect('/donor/dashboard?tab=donations&err=' + encodeURIComponent('Invalid update.'));
    }
    try {
        await db.query(
            "UPDATE donations SET item_type = ?, quantity = ? WHERE id = ? AND user_id = ? AND status = 'pledged'",
            [itemType, quantity, id, userId]
        );
        res.redirect('/donor/dashboard?tab=donations&ok=' + encodeURIComponent('Pledge updated.'));
    } catch (e) {
        console.error('Update donation error:', e);
        res.redirect('/donor/dashboard?tab=donations&err=' + encodeURIComponent('Could not update pledge.'));
    }
});

// DELETE — cancel a pledge (only while still 'pledged', not yet 'received')
router.post('/donations/:id/delete', guard, async (req, res) => {
    const userId = req.session.user.id;
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
        return res.redirect('/donor/dashboard?tab=donations&err=' + encodeURIComponent('Invalid donation.'));
    }
    try {
        await db.query(
            "DELETE FROM donations WHERE id = ? AND user_id = ? AND status = 'pledged'",
            [id, userId]
        );
        res.redirect('/donor/dashboard?tab=donations&ok=' + encodeURIComponent('Pledge cancelled.'));
    } catch (e) {
        console.error('Delete donation error:', e);
        res.redirect('/donor/dashboard?tab=donations&err=' + encodeURIComponent('Could not cancel pledge.'));
    }
});

module.exports = router;