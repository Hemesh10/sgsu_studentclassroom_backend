const mongoose = require('mongoose');

const ContestSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please provide a title'],
      trim: true
    },
    description: {
      type: String,
      required: [true, 'Please provide a description']
    },
    featuredImage: {
      type: String,
      default: 'default-contest.jpg'
    },
    startDate: {
      type: Date,
      required: [true, 'Please provide a start date']
    },
    endDate: {
      type: Date,
      required: [true, 'Please provide an end date']
    },
    registrationDeadline: {
      type: Date,
      required: [true, 'Please provide a registration deadline']
    },
    entryFee: {
      type: Number,
      default: 0
    },
    maxParticipants: {
      type: Number,
      default: null
    },
    location: {
      type: String,
      default: 'Online'
    },
    organizers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    participants: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      registeredAt: {
        type: Date,
        default: Date.now
      },
      paymentStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
      },
      paymentId: {
        type: String
      }
    }],
    status: {
      type: String,
      enum: ['upcoming', 'ongoing', 'completed', 'cancelled'],
      default: 'upcoming'
    },
    category: {
      type: String,
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for participant count
ContestSchema.virtual('participantCount').get(function() {
  return this.participants.length;
});

// Virtual for checking if registration is open
ContestSchema.virtual('isRegistrationOpen').get(function() {
  const now = new Date();
  return now <= this.registrationDeadline && this.status !== 'cancelled';
});

// Index for text search
ContestSchema.index({ title: 'text', description: 'text', category: 'text' });

// Method to check if contest is full
ContestSchema.methods.isFull = function() {
  if (!this.maxParticipants) return false;
  return this.participants.length >= this.maxParticipants;
};

// Method to update status based on dates
ContestSchema.methods.updateStatus = function() {
  const now = new Date();
  
  if (this.status === 'cancelled') return;
  
  if (now < this.startDate) {
    this.status = 'upcoming';
  } else if (now >= this.startDate && now <= this.endDate) {
    this.status = 'ongoing';
  } else if (now > this.endDate) {
    this.status = 'completed';
  }
  
  return this.save();
};

module.exports = mongoose.model('Contest', ContestSchema);