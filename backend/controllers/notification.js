const { validationResult } = require('express-validator');
const Notification = require('../models/Notification');
const User = require('../models/User');

// @desc    Create a new notification
// @route   POST /api/notifications
// @access  Private (Admin)
exports.createNotification = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, message, recipients, targetUsers, urgencyLevel, relatedTo, relatedId } = req.body;

    // Create notification object
    const notificationData = {
      title,
      message,
      sender: req.user.id,
      urgencyLevel: urgencyLevel || 'info',
      relatedTo: relatedTo || 'general'
    };

    // Handle recipients and target users
    if (recipients === 'specific' && targetUsers && targetUsers.length > 0) {
      notificationData.recipients = 'specific';
      notificationData.targetUsers = targetUsers;
    } else {
      notificationData.recipients = 'all';
      // If sending to all, find all students
      const students = await User.find({ role: 'student' }).select('_id');
      notificationData.targetUsers = students.map(student => student._id);
    }

    // Add related document if provided
    if (relatedTo && relatedTo !== 'general' && relatedId) {
      notificationData.relatedId = relatedId;
      
      // Set the notification type based on related entity
      switch (relatedTo) {
        case 'blog':
          notificationData.notificationType = 'Blog';
          break;
        case 'contest':
          notificationData.notificationType = 'Contest';
          break;
        case 'payment':
          notificationData.notificationType = 'Payment';
          break;
        default:
          notificationData.notificationType = null;
      }
    }

    // Create and save notification
    const notification = new Notification(notificationData);
    await notification.save();

    // Send real-time notification via Socket.io
    const io = req.app.get('io');
    notification.targetUsers.forEach(userId => {
      io.to(userId.toString()).emit('notification', {
        type: 'NEW_NOTIFICATION',
        message: notification.title,
        data: notification
      });
    });

    res.status(201).json({
      message: 'Notification sent successfully',
      notification
    });
  } catch (error) {
    console.error('Create notification error:', error.message);
    next(error);
  }
};

// @desc    Get notifications for current user
// @route   GET /api/notifications
// @access  Private
exports.getMyNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, unreadOnly = false } = req.query;
    const skip = (page - 1) * limit;

    // Build query to find notifications where current user is a target
    const query = {
      targetUsers: { $in: [req.user.id] }
    };

    // Add filter for unread notifications if specified
    if (unreadOnly === 'true') {
      query[`isRead.${req.user.id}`] = { $ne: true };
    }

    // Get notifications with pagination
    const notifications = await Notification.find(query)
      .populate('sender', 'name avatar role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await Notification.countDocuments(query);

    // Transform notifications to add isRead flag for the current user
    const transformedNotifications = notifications.map(notification => {
      const notificationObj = notification.toObject();
      notificationObj.isReadByMe = notification.isReadByUser(req.user.id);
      return notificationObj;
    });

    res.json({
      notifications: transformedNotifications,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error.message);
    next(error);
  }
};

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
exports.markAsRead = async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    // Check if user is a target of this notification
    if (!notification.targetUsers.some(userId => userId.toString() === req.user.id)) {
      return res.status(403).json({ message: 'Not authorized to access this notification' });
    }

    // Mark as read for current user
    await notification.markAsRead(req.user.id);

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark notification as read error:', error.message);
    next(error);
  }
};

// @desc    Get all notifications (admin)
// @route   GET /api/notifications/all
// @access  Private (Admin)
exports.getAllNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    // Get all notifications with pagination
    const notifications = await Notification.find()
      .populate('sender', 'name avatar role')
      .populate('targetUsers', 'name avatar role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await Notification.countDocuments();

    res.json({
      notifications,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get all notifications error:', error.message);
    next(error);
  }
};

// @desc    Delete notification
// @route   DELETE /api/notifications/:id
// @access  Private (Admin)
exports.deleteNotification = async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    await notification.deleteOne();

    res.json({ message: 'Notification removed' });
  } catch (error) {
    console.error('Delete notification error:', error.message);
    next(error);
  }
};