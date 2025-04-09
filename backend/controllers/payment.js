const crypto = require('crypto');
const axios = require('axios');
const Payment = require('../models/Payment');
const Contest = require('../models/Contest');
const User = require('../models/User');
const Notification = require('../models/Notification');

// Razorpay configuration
const razorpayKeyId = process.env.RAZORPAY_KEY_ID || 'your_razorpay_key_id';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || 'your_razorpay_key_secret';

// Basic auth for Razorpay API
const razorpayAuth = Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64');

// @desc    Create a payment order for Razorpay
// @route   POST /api/payments/create-order
// @access  Private
exports.createOrder = async (req, res, next) => {
  try {
    const { amount, purpose, relatedId, relatedModel } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }
    
    if (!purpose) {
      return res.status(400).json({ message: 'Purpose is required' });
    }
    
    // Validate related entity exists if provided
    if (relatedId && relatedModel) {
      let model;
      
      switch (relatedModel) {
        case 'Contest':
          model = await Contest.findById(relatedId);
          break;
        // Add other models as needed
        default:
          model = null;
      }
      
      if (!model) {
        return res.status(404).json({ message: `${relatedModel} not found` });
      }
    }
    
    // Generate a receipt ID
    const receipt = `receipt_${Date.now()}_${req.user.id}`;
    
    // Create order in Razorpay
    const response = await axios.post(
      'https://api.razorpay.com/v1/orders',
      {
        amount: amount * 100, // Razorpay amount is in paise (1/100 of a rupee)
        currency: 'INR',
        receipt,
        payment_capture: 1
      },
      {
        headers: {
          'Authorization': `Basic ${razorpayAuth}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Create a payment record in our database
    const payment = new Payment({
      user: req.user.id,
      amount,
      purpose,
      relatedTo: relatedId || null,
      relatedModel: relatedModel || null,
      status: 'pending',
      razorpayOrderId: response.data.id,
      receipt
    });
    
    await payment.save();
    
    // Return order details to frontend
    res.json({
      message: 'Payment order created',
      order: {
        id: response.data.id,
        amount: response.data.amount / 100, // Convert back to rupees for display
        currency: response.data.currency,
        receipt: response.data.receipt
      },
      paymentId: payment._id
    });
  } catch (error) {
    console.error('Create payment order error:', error.message);
    if (error.response && error.response.data) {
      console.error('Razorpay error details:', error.response.data);
    }
    next(error);
  }
};

// @desc    Verify and capture payment
// @route   POST /api/payments/verify
// @access  Private
exports.verifyPayment = async (req, res, next) => {
  try {
    const { razorpayPaymentId, razorpayOrderId, razorpaySignature, paymentId } = req.body;
    
    // Verify signature
    const generatedSignature = crypto
      .createHmac('sha256', razorpayKeySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');
    
    if (generatedSignature !== razorpaySignature) {
      return res.status(400).json({ message: 'Invalid payment signature' });
    }
    
    // Find the payment in our database
    const payment = await Payment.findById(paymentId);
    
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    
    // Update payment record
    payment.razorpayPaymentId = razorpayPaymentId;
    payment.razorpaySignature = razorpaySignature;
    payment.status = 'completed';
    
    await payment.save();
    
    // If this was a contest payment, update contest participant status
    if (payment.purpose === 'contest' && payment.relatedModel === 'Contest') {
      const contest = await Contest.findById(payment.relatedTo);
      
      if (contest) {
        // Find and update the participant's payment status
        const participantIndex = contest.participants.findIndex(
          p => p.user.toString() === req.user.id
        );
        
        if (participantIndex !== -1) {
          contest.participants[participantIndex].paymentStatus = 'completed';
          contest.participants[participantIndex].paymentId = payment._id;
          
          await contest.save();
        }
      }
    }
    
    // Send notification to the user
    const notification = new Notification({
      title: 'Payment Successful',
      message: `Your payment of ₹${payment.amount} for ${payment.purpose} has been processed successfully.`,
      sender: req.user.id, // Self-notification
      recipients: 'specific',
      targetUsers: [req.user.id],
      urgencyLevel: 'important',
      relatedTo: 'payment',
      relatedId: payment._id,
      notificationType: 'Payment'
    });
    
    await notification.save();
    
    // Send real-time notification
    const io = req.app.get('io');
    io.to(req.user.id).emit('notification', {
      type: 'PAYMENT_SUCCESS',
      message: `Payment of ₹${payment.amount} successful`,
      data: notification
    });
    
    res.json({
      message: 'Payment verified and captured successfully',
      payment: {
        id: payment._id,
        amount: payment.amount,
        status: payment.status,
        purpose: payment.purpose,
        createdAt: payment.createdAt
      }
    });
  } catch (error) {
    console.error('Verify payment error:', error.message);
    next(error);
  }
};

// @desc    Get payment history for current user
// @route   GET /api/payments/history
// @access  Private
exports.getPaymentHistory = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;
    
    // Build query
    const query = { user: req.user.id };
    
    if (status) {
      query.status = status;
    }
    
    // Get payments with pagination
    const payments = await Payment.find(query)
      .populate({
        path: 'relatedTo',
        select: 'title',
        model: context => context.relatedModel
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await Payment.countDocuments(query);
    
    res.json({
      payments,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get payment history error:', error.message);
    next(error);
  }
};

// @desc    Get all payments (admin)
// @route   GET /api/payments/all
// @access  Private (Admin)
exports.getAllPayments = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, purpose, userId } = req.query;
    const skip = (page - 1) * limit;
    
    // Build query
    const query = {};
    
    if (status) query.status = status;
    if (purpose) query.purpose = purpose;
    if (userId) query.user = userId;
    
    // Get payments with pagination
    const payments = await Payment.find(query)
      .populate('user', 'name email')
      .populate({
        path: 'relatedTo',
        select: 'title',
        model: context => context.relatedModel
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await Payment.countDocuments(query);
    
    // Get some payment statistics
    const stats = {
      totalRevenue: await Payment.getTotalRevenue(),
      completedCount: await Payment.countDocuments({ status: 'completed' }),
      pendingCount: await Payment.countDocuments({ status: 'pending' })
    };
    
    res.json({
      payments,
      stats,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get all payments error:', error.message);
    next(error);
  }
};

// @desc    Get payment by ID
// @route   GET /api/payments/:id
// @access  Private (Owner or Admin)
exports.getPaymentById = async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('user', 'name email')
      .populate({
        path: 'relatedTo',
        select: 'title description',
        model: context => context.relatedModel
      });
    
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    
    // Check if user is the owner or admin
    if (payment.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to access this payment' });
    }
    
    res.json(payment);
  } catch (error) {
    console.error('Get payment by ID error:', error.message);
    next(error);
  }
};