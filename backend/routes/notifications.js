const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const passport = require('passport');
const notificationController = require('../controllers/notification');
const { isAdmin } = require('../middleware/rbac');

// Authentication middleware
const auth = passport.authenticate('jwt', { session: false });

// @route   POST /api/notifications
// @desc    Create a new notification
// @access  Private (Admin)
router.post(
  '/',
  [
    auth,
    isAdmin,
    [
      check('title', 'Title is required').not().isEmpty(),
      check('message', 'Message is required').not().isEmpty(),
      check('recipients', 'Recipients must be either "all" or "specific"').isIn(['all', 'specific']),
      check('targetUsers', 'Target users are required when recipients is "specific"')
        .if((value, { req }) => req.body.recipients === 'specific')
        .isArray()
        .not()
        .isEmpty(),
      check('urgencyLevel', 'Urgency level must be "info", "important", or "urgent"')
        .optional()
        .isIn(['info', 'important', 'urgent'])
    ]
  ],
  notificationController.createNotification
);

// @route   GET /api/notifications
// @desc    Get notifications for current user
// @access  Private
router.get('/', auth, notificationController.getMyNotifications);

// @route   PUT /api/notifications/:id/read
// @desc    Mark notification as read
// @access  Private
router.put('/:id/read', auth, notificationController.markAsRead);

// @route   GET /api/notifications/all
// @desc    Get all notifications (admin)
// @access  Private (Admin)
router.get('/all', [auth, isAdmin], notificationController.getAllNotifications);

// @route   DELETE /api/notifications/:id
// @desc    Delete notification
// @access  Private (Admin)
router.delete('/:id', [auth, isAdmin], notificationController.deleteNotification);

module.exports = router;