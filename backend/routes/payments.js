const express = require('express');
const router = express.Router();
const passport = require('passport');
const paymentController = require('../controllers/payment');
const { isAdmin } = require('../middleware/rbac');

// Authentication middleware
const auth = passport.authenticate('jwt', { session: false });

// @route   POST /api/payments/create-order
// @desc    Create a payment order for Razorpay
// @access  Private
router.post('/create-order', auth, paymentController.createOrder);

// @route   POST /api/payments/verify
// @desc    Verify and capture payment
// @access  Private
router.post('/verify', auth, paymentController.verifyPayment);

// @route   GET /api/payments/history
// @desc    Get payment history for current user
// @access  Private
router.get('/history', auth, paymentController.getPaymentHistory);

// @route   GET /api/payments/all
// @desc    Get all payments (admin)
// @access  Private (Admin)
router.get('/all', [auth, isAdmin], paymentController.getAllPayments);

// @route   GET /api/payments/:id
// @desc    Get payment by ID
// @access  Private (Owner or Admin)
router.get('/:id', auth, paymentController.getPaymentById);

module.exports = router;