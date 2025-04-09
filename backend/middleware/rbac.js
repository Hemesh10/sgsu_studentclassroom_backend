// Role-based access control middleware

/**
 * Middleware to check if user has admin role
 */
exports.isAdmin = (req, res, next) => {
  // User is attached by passport middleware
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
  }
  
  next();
};

/**
 * Middleware to check if user has student role
 */
exports.isStudent = (req, res, next) => {
  // User is attached by passport middleware
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  
  if (req.user.role !== 'student') {
    return res.status(403).json({ message: 'Access denied. Student privileges required.' });
  }
  
  next();
};

/**
 * Middleware to check if user owns a resource or is admin
 * @param {Function} getResourceOwnerId Function to extract owner ID from the request
 */
exports.isOwnerOrAdmin = (getResourceOwnerId) => {
  return async (req, res, next) => {
    try {
      // User is attached by passport middleware
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      // Allow admins to access any resource
      if (req.user.role === 'admin') {
        return next();
      }
      
      // Get resource owner ID using the provided function
      const ownerId = await getResourceOwnerId(req);
      
      // Check if the current user is the owner
      if (!ownerId || ownerId.toString() !== req.user.id.toString()) {
        return res.status(403).json({ message: 'Access denied. You are not the owner of this resource.' });
      }
      
      next();
    } catch (error) {
      console.error('Error in isOwnerOrAdmin middleware:', error);
      res.status(500).json({ message: 'Server error' });
    }
  };
};

/**
 * Example usage:
 * 
 * // In blog routes:
 * const { isOwnerOrAdmin } = require('../middleware/rbac');
 * 
 * // Middleware to check if user is the blog owner or an admin
 * router.put(
 *   '/:id',
 *   auth,
 *   isOwnerOrAdmin(async (req) => {
 *     const blog = await Blog.findById(req.params.id);
 *     return blog ? blog.author : null;
 *   }),
 *   blogController.updateBlog
 * );
 */