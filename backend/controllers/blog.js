const { validationResult } = require('express-validator');
const Blog = require('../models/Blog');
const User = require('../models/User');
const Notification = require('../models/Notification');

// @desc    Create a new blog
// @route   POST /api/blogs
// @access  Private (Student)
exports.createBlog = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, content, tags, featuredImage } = req.body;

    // Create new blog
    const newBlog = new Blog({
      title,
      content,
      author: req.user.id,
      status: 'pending', // All new blogs are pending approval
      tags: tags ? tags.split(',').map(tag => tag.trim()) : []
    });

    // Add featured image if provided
    if (featuredImage) {
      newBlog.featuredImage = featuredImage;
    }

    await newBlog.save();

    // Notify admins about new blog submission
    const admins = await User.find({ role: 'admin' });
    
    if (admins.length > 0) {
      const notification = new Notification({
        title: 'New Blog Submission',
        message: `A new blog "${title}" has been submitted for approval.`,
        sender: req.user.id,
        recipients: 'specific',
        targetUsers: admins.map(admin => admin._id),
        urgencyLevel: 'info',
        relatedTo: 'blog',
        relatedId: newBlog._id,
        notificationType: 'Blog'
      });
      
      await notification.save();
      
      // Send real-time notification via Socket.io
      const io = req.app.get('io');
      admins.forEach(admin => {
        io.to(admin._id.toString()).emit('notification', {
          type: 'NEW_BLOG',
          message: `New blog "${title}" submitted for approval`,
          data: notification
        });
      });
    }

    res.status(201).json({
      message: 'Blog submitted successfully and is pending approval',
      blog: newBlog
    });
  } catch (error) {
    console.error('Create blog error:', error.message);
    next(error);
  }
};

// @desc    Get all blogs
// @route   GET /api/blogs
// @access  Public (with filtering for status)
exports.getBlogs = async (req, res, next) => {
  try {
    const { status, tag, search, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    
    // Build query
    const query = {};
    
    // Filter by status (public users can only see approved blogs)
    if (req.user && req.user.role === 'admin') {
      // Admins can filter by any status
      if (status) {
        query.status = status;
      }
    } else {
      // Regular users and non-authenticated users can only see approved blogs
      query.status = 'approved';
    }
    
    // Filter by tag
    if (tag) {
      query.tags = tag;
    }
    
    // Search in title and content
    if (search) {
      query.$text = { $search: search };
    }
    
    // Get blogs with pagination
    const blogs = await Blog.find(query)
      .populate('author', 'name avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await Blog.countDocuments(query);
    
    res.json({
      blogs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get blogs error:', error.message);
    next(error);
  }
};

// @desc    Get blog by ID
// @route   GET /api/blogs/:id
// @access  Public or Private (depending on status)
exports.getBlogById = async (req, res, next) => {
  try {
    const blog = await Blog.findById(req.params.id)
      .populate('author', 'name avatar bio')
      .populate('comments.user', 'name avatar');
    
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }
    
    // Check if blog is approved or if user is author or admin
    const isAuthorOrAdmin = req.user && (
      req.user.role === 'admin' || 
      blog.author._id.toString() === req.user.id
    );
    
    if (blog.status !== 'approved' && !isAuthorOrAdmin) {
      return res.status(403).json({ message: 'This blog is not published yet' });
    }
    
    // Increment view count (only for approved blogs and not by the author)
    if (blog.status === 'approved' && (!req.user || blog.author._id.toString() !== req.user.id)) {
      blog.views += 1;
      await blog.save();
    }
    
    res.json(blog);
  } catch (error) {
    console.error('Get blog by ID error:', error.message);
    next(error);
  }
};

// @desc    Update blog
// @route   PUT /api/blogs/:id
// @access  Private (Owner)
exports.updateBlog = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, content, tags, featuredImage } = req.body;
    
    let blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }
    
    // Check if user is the author of the blog
    if (blog.author.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this blog' });
    }
    
    // Only allow updates if blog is pending or rejected
    // Once approved, students can't modify it (but admins can)
    if (blog.status === 'approved' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Cannot update an approved blog' });
    }
    
    // If previously rejected, set back to pending on update
    if (blog.status === 'rejected' && req.user.role !== 'admin') {
      blog.status = 'pending';
    }
    
    // Update fields
    blog.title = title || blog.title;
    blog.content = content || blog.content;
    
    if (tags) {
      blog.tags = tags.split(',').map(tag => tag.trim());
    }
    
    if (featuredImage) {
      blog.featuredImage = featuredImage;
    }
    
    await blog.save();
    
    // If status changed to pending, notify admins again
    if (blog.status === 'pending' && req.user.role !== 'admin') {
      const admins = await User.find({ role: 'admin' });
      
      if (admins.length > 0) {
        const notification = new Notification({
          title: 'Blog Updated and Needs Review',
          message: `Blog "${blog.title}" has been updated and needs review.`,
          sender: req.user.id,
          recipients: 'specific',
          targetUsers: admins.map(admin => admin._id),
          urgencyLevel: 'info',
          relatedTo: 'blog',
          relatedId: blog._id,
          notificationType: 'Blog'
        });
        
        await notification.save();
        
        // Send real-time notification
        const io = req.app.get('io');
        admins.forEach(admin => {
          io.to(admin._id.toString()).emit('notification', {
            type: 'BLOG_UPDATE',
            message: `Blog "${blog.title}" updated and needs review`,
            data: notification
          });
        });
      }
    }
    
    res.json({
      message: 'Blog updated successfully',
      blog
    });
  } catch (error) {
    console.error('Update blog error:', error.message);
    next(error);
  }
};

// @desc    Delete blog
// @route   DELETE /api/blogs/:id
// @access  Private (Owner or Admin)
exports.deleteBlog = async (req, res, next) => {
  try {
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }
    
    // Check if user is the author or admin
    if (blog.author.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this blog' });
    }
    
    await blog.deleteOne();
    
    res.json({ message: 'Blog removed' });
  } catch (error) {
    console.error('Delete blog error:', error.message);
    next(error);
  }
};

// @desc    Change blog status (approve/reject)
// @route   PUT /api/blogs/:id/status
// @access  Private (Admin only)
exports.changeBlogStatus = async (req, res, next) => {
  try {
    const { status, rejectionReason } = req.body;
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }
    
    // Update status
    blog.status = status;
    
    // If rejected, save reason
    if (status === 'rejected' && rejectionReason) {
      blog.rejectionReason = rejectionReason;
    } else if (status === 'approved') {
      blog.rejectionReason = '';
    }
    
    await blog.save();
    
    // Notify the author about the status change
    const notification = new Notification({
      title: `Blog ${status === 'approved' ? 'Approved' : 'Rejected'}`,
      message: status === 'approved' 
        ? `Your blog "${blog.title}" has been approved and published.` 
        : `Your blog "${blog.title}" has been rejected. Reason: ${rejectionReason || 'No reason provided'}`,
      sender: req.user.id,
      recipients: 'specific',
      targetUsers: [blog.author],
      urgencyLevel: 'important',
      relatedTo: 'blog',
      relatedId: blog._id,
      notificationType: 'Blog'
    });
    
    await notification.save();
    
    // Send real-time notification
    const io = req.app.get('io');
    io.to(blog.author.toString()).emit('notification', {
      type: 'BLOG_STATUS_CHANGE',
      message: status === 'approved' 
        ? `Your blog "${blog.title}" has been approved!` 
        : `Your blog "${blog.title}" has been rejected`,
      data: notification
    });
    
    res.json({
      message: `Blog ${status === 'approved' ? 'approved and published' : 'rejected'}`,
      blog
    });
  } catch (error) {
    console.error('Change blog status error:', error.message);
    next(error);
  }
};

// @desc    Add comment to blog
// @route   POST /api/blogs/:id/comments
// @access  Private
exports.addComment = async (req, res, next) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ message: 'Comment text is required' });
    }
    
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }
    
    // Only allow comments on approved blogs
    if (blog.status !== 'approved') {
      return res.status(403).json({ message: 'Cannot comment on unpublished blogs' });
    }
    
    const user = await User.findById(req.user.id).select('name avatar');
    
    const newComment = {
      user: req.user.id,
      text,
      name: user.name,
      avatar: user.avatar
    };
    
    blog.comments.unshift(newComment);
    await blog.save();
    
    // Notify blog author about the new comment (if not self-commenting)
    if (blog.author.toString() !== req.user.id) {
      const notification = new Notification({
        title: 'New Comment on Your Blog',
        message: `${user.name} commented on your blog "${blog.title}"`,
        sender: req.user.id,
        recipients: 'specific',
        targetUsers: [blog.author],
        urgencyLevel: 'info',
        relatedTo: 'blog',
        relatedId: blog._id,
        notificationType: 'Blog'
      });
      
      await notification.save();
      
      // Send real-time notification
      const io = req.app.get('io');
      io.to(blog.author.toString()).emit('notification', {
        type: 'NEW_COMMENT',
        message: `New comment on your blog "${blog.title}"`,
        data: notification
      });
    }
    
    res.json(blog.comments);
  } catch (error) {
    console.error('Add comment error:', error.message);
    next(error);
  }
};

// @desc    Get all blogs by current user
// @route   GET /api/blogs/my-blogs
// @access  Private
exports.getMyBlogs = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    
    // Build query
    const query = { author: req.user.id };
    
    // Filter by status if provided
    if (status) {
      query.status = status;
    }
    
    // Get blogs with pagination
    const blogs = await Blog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await Blog.countDocuments(query);
    
    res.json({
      blogs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get my blogs error:', error.message);
    next(error);
  }
};