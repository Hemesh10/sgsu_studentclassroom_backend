const { validationResult } = require('express-validator');
const User = require('../models/User');
const Blog = require('../models/Blog');
const Contest = require('../models/Contest');
const Notification = require('../models/Notification');

// @desc    Get all users (admin)
// @route   GET /api/users
// @access  Private (Admin)
exports.getAllUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, role, search, isActive } = req.query;
    const skip = (page - 1) * limit;
    
    // Build query
    const query = {};
    
    // Filter by role
    if (role) {
      query.role = role;
    }
    
    // Filter by active status
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    // Search by name or email
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Get users with pagination
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await User.countDocuments(query);
    
    // Get user statistics
    const stats = {
      totalStudents: await User.countDocuments({ role: 'student' }),
      totalAdmins: await User.countDocuments({ role: 'admin' }),
      activeUsers: await User.countDocuments({ isActive: true }),
      inactiveUsers: await User.countDocuments({ isActive: false })
    };
    
    res.json({
      users,
      stats,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get all users error:', error.message);
    next(error);
  }
};

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private (Admin)
exports.getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Get user's blogs
    const blogs = await Blog.find({ author: user._id })
      .select('title status createdAt views')
      .sort({ createdAt: -1 })
      .limit(5);
    
    // Get user's registered contests
    const contests = await Contest.find({ 'participants.user': user._id })
      .select('title startDate status')
      .sort({ startDate: -1 })
      .limit(5);
    
    res.json({
      user,
      blogs,
      contests,
      activitySummary: {
        totalBlogs: await Blog.countDocuments({ author: user._id }),
        publishedBlogs: await Blog.countDocuments({ author: user._id, status: 'approved' }),
        pendingBlogs: await Blog.countDocuments({ author: user._id, status: 'pending' }),
        registeredContests: await Contest.countDocuments({ 'participants.user': user._id })
      }
    });
  } catch (error) {
    console.error('Get user by ID error:', error.message);
    next(error);
  }
};

// @desc    Update user (admin)
// @route   PUT /api/users/:id
// @access  Private (Admin)
exports.updateUser = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { name, email, role, isActive, department, year, isVerified } = req.body;
    
    // Build update object
    const updateFields = {};
    
    if (name) updateFields.name = name;
    if (email) updateFields.email = email;
    if (role) updateFields.role = role;
    if (isActive !== undefined) updateFields.isActive = isActive;
    if (department) updateFields.department = department;
    if (year) updateFields.year = year;
    if (isVerified !== undefined) updateFields.isVerified = isVerified;
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // If user was deactivated, notify them
    if (isActive === false && user.isActive === false) {
      const notification = new Notification({
        title: 'Account Suspended',
        message: 'Your account has been suspended. Please contact administration for further information.',
        sender: req.user.id,
        recipients: 'specific',
        targetUsers: [user._id],
        urgencyLevel: 'urgent',
        relatedTo: 'account'
      });
      
      await notification.save();
      
      // Send real-time notification
      const io = req.app.get('io');
      io.to(user._id.toString()).emit('notification', {
        type: 'ACCOUNT_SUSPENDED',
        message: 'Your account has been suspended',
        data: notification
      });
    }
    
    res.json({
      message: 'User updated successfully',
      user
    });
  } catch (error) {
    console.error('Update user error:', error.message);
    next(error);
  }
};

// @desc    Delete user (admin)
// @route   DELETE /api/users/:id
// @access  Private (Admin)
exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Don't allow deleting yourself
    if (user._id.toString() === req.user.id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }
    
    // Delete all of the user's blogs
    await Blog.deleteMany({ author: user._id });
    
    // Remove user from contests
    await Contest.updateMany(
      { 'participants.user': user._id },
      { $pull: { participants: { user: user._id } } }
    );
    
    // Delete user's notifications
    await Notification.deleteMany({ 
      $or: [
        { sender: user._id },
        { targetUsers: user._id }
      ]
    });
    
    // Finally, delete the user
    await user.deleteOne();
    
    res.json({ message: 'User and all associated data deleted' });
  } catch (error) {
    console.error('Delete user error:', error.message);
    next(error);
  }
};

// @desc    Make user admin
// @route   PUT /api/users/:id/make-admin
// @access  Private (Admin)
exports.makeAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if user is already an admin
    if (user.role === 'admin') {
      return res.status(400).json({ message: 'User is already an admin' });
    }
    
    // Update user role
    user.role = 'admin';
    await user.save();
    
    // Notify the user about role change
    const notification = new Notification({
      title: 'Role Upgraded to Admin',
      message: 'You have been granted administrator privileges on the platform.',
      sender: req.user.id,
      recipients: 'specific',
      targetUsers: [user._id],
      urgencyLevel: 'important',
      relatedTo: 'account'
    });
    
    await notification.save();
    
    // Send real-time notification
    const io = req.app.get('io');
    io.to(user._id.toString()).emit('notification', {
      type: 'ROLE_CHANGE',
      message: 'You are now an admin',
      data: notification
    });
    
    res.json({
      message: 'User role updated to admin',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Make admin error:', error.message);
    next(error);
  }
};

// @desc    Get user statistics (admin)
// @route   GET /api/users/stats
// @access  Private (Admin)
exports.getUserStats = async (req, res, next) => {
  try {
    // User counts
    const totalUsers = await User.countDocuments();
    const totalStudents = await User.countDocuments({ role: 'student' });
    const totalAdmins = await User.countDocuments({ role: 'admin' });
    const activeUsers = await User.countDocuments({ isActive: true });
    
    // Blog stats
    const totalBlogs = await Blog.countDocuments();
    const pendingBlogs = await Blog.countDocuments({ status: 'pending' });
    const approvedBlogs = await Blog.countDocuments({ status: 'approved' });
    const rejectedBlogs = await Blog.countDocuments({ status: 'rejected' });
    
    // Contest stats
    const totalContests = await Contest.countDocuments();
    const activeContests = await Contest.countDocuments({ 
      status: { $in: ['upcoming', 'ongoing'] },
      isActive: true
    });
    
    // Get recent user registrations (last 7 days)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const recentUsers = await User.find({
      createdAt: { $gte: oneWeekAgo }
    })
    .countDocuments();
    
    res.json({
      userStats: {
        total: totalUsers,
        students: totalStudents,
        admins: totalAdmins,
        active: activeUsers,
        inactive: totalUsers - activeUsers,
        recentRegistrations: recentUsers
      },
      contentStats: {
        blogs: {
          total: totalBlogs,
          pending: pendingBlogs,
          approved: approvedBlogs,
          rejected: rejectedBlogs
        },
        contests: {
          total: totalContests,
          active: activeContests
        }
      }
    });
  } catch (error) {
    console.error('Get user stats error:', error.message);
    next(error);
  }
};