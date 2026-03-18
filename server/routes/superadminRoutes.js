const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { superadminAuth } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * POST /api/superadmin/login
 * Authenticate superadmin using env credentials.
 */
router.post('/login', (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }

        if (
            username !== process.env.SUPERADMIN_USERNAME ||
            password !== process.env.SUPERADMIN_PASSWORD
        ) {
            return res.status(401).json({ error: 'Invalid superadmin credentials.' });
        }

        const token = jwt.sign(
            { username: process.env.SUPERADMIN_USERNAME, role: 'superadmin' },
            process.env.JWT_SECRET,
            { expiresIn: '4h' }
        );

        res.json({ token });
    } catch (err) {
        console.error('Superadmin login error:', err);
        res.status(500).json({ error: 'Server error during login.' });
    }
});

/**
 * GET /api/superadmin/users
 * List all user accounts. Protected by superadmin auth.
 */
router.get('/users', superadminAuth, async (req, res) => {
    try {
        const users = await User.find({}, 'username createdAt').sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        console.error('List users error:', err);
        res.status(500).json({ error: 'Failed to fetch users.' });
    }
});

/**
 * POST /api/superadmin/users
 * Create a new user account. Protected by superadmin auth.
 */
router.post('/users', superadminAuth, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }

        if (username.trim().length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        const existing = await User.findOne({ username: username.trim().toLowerCase() });
        if (existing) {
            return res.status(409).json({ error: 'Username already exists.' });
        }

        const user = await User.create({
            username: username.trim().toLowerCase(),
            password
        });

        res.status(201).json({
            _id: user._id,
            username: user.username,
            createdAt: user.createdAt
        });
    } catch (err) {
        console.error('Create user error:', err);
        res.status(500).json({ error: 'Failed to create user.' });
    }
});

/**
 * DELETE /api/superadmin/users/:id
 * Delete a user account. Protected by superadmin auth.
 */
router.delete('/users/:id', superadminAuth, async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }
        res.json({ message: 'User deleted successfully.' });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'Failed to delete user.' });
    }
});

module.exports = router;
