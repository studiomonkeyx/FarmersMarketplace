const { z } = require('zod');

const WEAK_PASSWORDS = new Set([
  'password', 'password1', 'Password1', 'Password1!',
  '12345678', '123456789', 'qwerty123', 'iloveyou',
  'admin123', 'letmein1', 'welcome1', 'monkey123',
]);

// Middleware factory — takes a Zod schema, validates req.body
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }));
      return res.status(400).json({
        success: false,
        message: details[0].message,
        code: 'validation_error',
        details,
      });
    }
    req.body = result.data; // use coerced/parsed values
    next();
  };
}

const schemas = {
  register: validate(z.object({
    name: z.string().min(1, 'name is required').trim(),
    email: z.string().email('valid email required'),
    password: z.string()
      .min(8, 'password must be at least 8 characters')
      .regex(/[A-Z]/, 'password must contain at least one uppercase letter')
      .regex(/[0-9]/, 'password must contain at least one number')
      .refine(v => !WEAK_PASSWORDS.has(v), 'password is too common, choose a stronger one'),
    role: z.enum(['farmer', 'buyer'], { errorMap: () => ({ message: 'role must be farmer or buyer' }) }),
  })),

  login: validate(z.object({
    email: z.string().email('valid email required'),
    password: z.string().min(1, 'password is required'),
  })),

  product: validate(z.object({
    name: z.string().min(1, 'name is required').trim(),
    price: z.coerce.number().positive('price must be a positive number'),
    quantity: z.coerce.number().int().positive('quantity must be a positive integer'),
    unit: z.string().trim().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    low_stock_threshold: z.coerce.number().int().nonnegative().optional(),
    image_url: z.string().url().optional().or(z.literal('')),
  })),

  order: validate(z.object({
    product_id: z.coerce.number().int().positive('product_id must be a positive integer'),
    quantity: z.coerce.number().int().positive('quantity must be a positive integer'),
  })),

  sendXLM: validate(z.object({
    destination: z.string().min(1, 'destination is required').regex(/^G[A-Z2-7]{55}$/, 'destination must be a valid Stellar public key'),
    amount: z.coerce.number().positive('amount must be a positive number').refine(v => v >= 0.0000001, 'amount too small'),
    memo: z.string().max(28, 'memo must be 28 characters or fewer').optional(),
  })),

  updateOrderStatus: validate(z.object({
    status: z.enum(['processing', 'shipped', 'delivered'], {
      errorMap: () => ({ message: 'status must be one of: processing, shipped, delivered' }),
    }),
  })),
};

module.exports = schemas;
