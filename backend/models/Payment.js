const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: 'INR'
    },
    purpose: {
      type: String,
      enum: ['contest', 'subscription', 'other'],
      required: true
    },
    relatedTo: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'relatedModel'
    },
    relatedModel: {
      type: String,
      enum: ['Contest', 'User', null],
      default: null
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending'
    },
    paymentMethod: {
      type: String,
      default: 'razorpay'
    },
    razorpayPaymentId: {
      type: String
    },
    razorpayOrderId: {
      type: String
    },
    razorpaySignature: {
      type: String
    },
    receipt: {
      type: String
    },
    notes: {
      type: String
    }
  },
  {
    timestamps: true
  }
);

// Index for faster queries
PaymentSchema.index({ user: 1, status: 1 });
PaymentSchema.index({ relatedTo: 1, relatedModel: 1 });

// Method to check if payment is successful
PaymentSchema.methods.isSuccessful = function() {
  return this.status === 'completed';
};

// Static method to get total revenue
PaymentSchema.statics.getTotalRevenue = async function() {
  const result = await this.aggregate([
    {
      $match: { status: 'completed' }
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$amount' }
      }
    }
  ]);
  
  return result.length > 0 ? result[0].totalRevenue : 0;
};

module.exports = mongoose.model('Payment', PaymentSchema);