const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    message: {
      type: String,
      required: true
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    recipients: {
      type: String,
      enum: ['all', 'specific'],
      default: 'all'
    },
    targetUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    urgencyLevel: {
      type: String,
      enum: ['info', 'important', 'urgent'],
      default: 'info'
    },
    isRead: {
      type: Map,
      of: Boolean,
      default: {}
    },
    relatedTo: {
      type: String,
      enum: ['blog', 'contest', 'payment', 'general', 'account'],
      default: 'general'
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'notificationType',
      default: null
    },
    notificationType: {
      type: String,
      enum: ['Blog', 'Contest', 'Payment', null],
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Method to mark as read for a specific user
NotificationSchema.methods.markAsRead = function(userId) {
  if (!this.isRead) this.isRead = new Map();
  this.isRead.set(userId.toString(), true);
  return this.save();
};

// Method to check if read by a specific user
NotificationSchema.methods.isReadByUser = function(userId) {
  if (!this.isRead) return false;
  return this.isRead.get(userId.toString()) || false;
};

module.exports = mongoose.model('Notification', NotificationSchema);