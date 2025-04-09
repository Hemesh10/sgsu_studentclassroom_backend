const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide your name'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Please provide your email'],
      unique: true,
      lowercase: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email'
      ]
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: 6,
      select: false // Don't return password in queries by default
    },
    role: {
      type: String,
      enum: ['student', 'admin'],
      default: 'student'
    },
    avatar: {
      type: String,
      default: 'default-avatar.png'
    },
    department: {
      type: String,
      default: ''
    },
    bio: {
      type: String,
      maxlength: 500
    },
    year: {
      type: String,
      enum: ['1st', '2nd', '3rd', '4th', 'PhD', ''],
      default: ''
    },
    isActive: {
      type: Boolean,
      default: true
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    contests: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contest'
    }],
    notifications: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Notification'
    }],
    resetPasswordToken: String,
    resetPasswordExpire: Date
  },
  {
    timestamps: true
  }
);

// Encrypt password before saving
UserSchema.pre('save', async function(next) {
  // Only run this function if password was modified
  if (!this.isModified('password')) return next();
  
  try {
    // Hash the password with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to check if password matches
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Virtual field for user's full blogs (with populated data)
UserSchema.virtual('userBlogs', {
  ref: 'Blog',
  localField: '_id',
  foreignField: 'author'
});

// Method to check if user is Admin
UserSchema.methods.isAdmin = function() {
  return this.role === 'admin';
};

// Method to check if user is Student
UserSchema.methods.isStudent = function() {
  return this.role === 'student';
};

module.exports = mongoose.model('User', UserSchema);