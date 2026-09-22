const http = require('http')
const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')

const port = process.env.PORT || 3000
const publicDir = path.join(__dirname, 'public')

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
}

// -----------------------------------------------------------------------------
// In-memory data
// -----------------------------------------------------------------------------

const products = [
  { id: 1, name: 'Mechanical Keyboard', price: 89.90 },
  { id: 2, name: 'Wireless Mouse', price: 39.90 },
  { id: 3, name: 'USB-C Dock', price: 119.00 },
  { id: 4, name: '27-inch Monitor', price: 249.00 }
]

const cartSessions = new Map()

const orders = []
let nextOrderId = 1

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  })

  res.end(JSON.stringify(body))
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''

    req.on('data', chunk => {
      body += chunk
    })

    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })

    req.on('error', reject)
  })
}

function calculateCartSubtotal(cart) {
  return cart.reduce((total, item) => {
    return total + item.price * item.quantity
  }, 0)
}

function getCartResponse(cart, appliedPromoCode) {
  const subtotal = calculateCartSubtotal(cart)
  const discount = appliedPromoCode === 'SAVE10' ? subtotal * 0.1 : 0
  const total = subtotal - discount

  return {
    items: cart,
    promoCode: appliedPromoCode,
    subtotal,
    discount,
    total
  }
}

function getCartSession(req, res) {
  const cookies = Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .map(cookie => cookie.trim())
      .filter(Boolean)
      .map(cookie => {
        const separator = cookie.indexOf('=')
        return [cookie.slice(0, separator), cookie.slice(separator + 1)]
      })
  )

  let sessionId = cookies['qa-shop-session']

  if (!sessionId) {
    sessionId = randomUUID()
    res.setHeader('Set-Cookie', `qa-shop-session=${sessionId}; Path=/; HttpOnly; SameSite=Lax`)
  }

  if (!cartSessions.has(sessionId)) {
    cartSessions.set(sessionId, {
      cart: [],
      appliedPromoCode: null
    })
  }

  return cartSessions.get(sessionId)
}

// -----------------------------------------------------------------------------
// Server
// -----------------------------------------------------------------------------

http.createServer(async (req, res) => {
  const cartSession = getCartSession(req, res)
  const url = new URL(req.url, `http://${req.headers.host}`)
  const pathname = url.pathname

  // ---------------------------------------------------------------------------
  // Products API
  // ---------------------------------------------------------------------------

  // GET /api/products
  if (req.method === 'GET' && pathname === '/api/products') {
    return sendJson(res, 200, products)
  }

  // GET /api/products/:id
  if (req.method === 'GET' && pathname.startsWith('/api/products/')) {
    const id = Number(pathname.split('/').pop())

    if (!Number.isInteger(id)) {
      return sendJson(res, 400, {
        error: 'Invalid product id'
      })
    }

    const product = products.find(product => product.id === id)

    if (!product) {
      return sendJson(res, 404, {
        error: 'Product not found'
      })
    }

    return sendJson(res, 200, product)
  }

  // ---------------------------------------------------------------------------
  // Cart API
  // ---------------------------------------------------------------------------

  // GET /api/cart
  if (req.method === 'GET' && pathname === '/api/cart') {
    return sendJson(res, 200, getCartResponse(cartSession.cart, cartSession.appliedPromoCode))
  }

  // POST /api/cart/items
  //
  // Body:
  // {
  //   "productId": 1,
  //   "quantity": 1
  // }
  if (req.method === 'POST' && pathname === '/api/cart/items') {
    try {
      const body = await readJsonBody(req)

      const productId = Number(body.productId)
      const quantity = body.quantity === undefined
        ? 1
        : Number(body.quantity)

      if (!Number.isInteger(productId)) {
        return sendJson(res, 400, {
          error: 'productId is required'
        })
      }

      if (!Number.isInteger(quantity) || quantity <= 0) {
        return sendJson(res, 400, {
          error: 'quantity must be a positive integer'
        })
      }

      const product = products.find(product => product.id === productId)

      if (!product) {
        return sendJson(res, 404, {
          error: 'Product not found'
        })
      }

      const existingItem = cartSession.cart.find(item => item.productId === productId)

      if (existingItem) {
        existingItem.quantity += quantity
      } else {
        cartSession.cart.push({
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity
        })
      }

      return sendJson(res, 201, getCartResponse(cartSession.cart, cartSession.appliedPromoCode))
    } catch {
      return sendJson(res, 400, {
        error: 'Invalid JSON'
      })
    }
  }

  // DELETE /api/cart/items/:productId
  if (
    req.method === 'DELETE' &&
    pathname.startsWith('/api/cart/items/')
  ) {
    const productId = Number(pathname.split('/').pop())

    if (!Number.isInteger(productId)) {
      return sendJson(res, 400, {
        error: 'Invalid product id'
      })
    }

    const itemExists = cartSession.cart.some(item => item.productId === productId)

    if (!itemExists) {
      return sendJson(res, 404, {
        error: 'Cart item not found'
      })
    }

    cartSession.cart = cartSession.cart.filter(item => item.productId !== productId)

    return sendJson(res, 200, getCartResponse())
  }

  // POST /api/cart/promo
  if (req.method === 'POST' && pathname === '/api/cart/promo') {
    try {
      const body = await readJsonBody(req)
      const promoCode = typeof body.code === 'string' ? body.code.toUpperCase() : ''

      if (!cartSession.cart.length) {
        return sendJson(res, 400, {
          error: 'Cart must contain at least one item'
        })
      }

      if (cartSession.appliedPromoCode) {
        return sendJson(res, 409, {
          error: 'A promo code has already been applied'
        })
      }

      if (promoCode !== 'SAVE10') {
        return sendJson(res, 400, {
          error: 'Invalid promo code'
        })
      }

      cartSession.appliedPromoCode = 'SAVE10'
      return sendJson(res, 200, getCartResponse())
    } catch {
      return sendJson(res, 400, {
        error: 'Invalid JSON'
      })
    }
  }

  // DELETE /api/cart
  //
  // Utility endpoint useful for test isolation.
  if (req.method === 'DELETE' && pathname === '/api/cart') {
    cartSession.cart = []
    cartSession.appliedPromoCode = null

    return sendJson(res, 200, getCartResponse())
  }

  // ---------------------------------------------------------------------------
  // Orders API
  // ---------------------------------------------------------------------------

  // POST /api/orders
  //
  // Body:
  // {
  //   "customer": {
  //     "name": "Test User",
  //     "email": "test@example.com"
  //   },
  //   "items": [
  //     {
  //       "productId": 1,
  //       "quantity": 1
  //     }
  //   ]
  // }
  if (req.method === 'POST' && pathname === '/api/orders') {
    try {
      const body = await readJsonBody(req)

      const customer = body.customer
      const requestedItems = body.items

      if (
        !customer ||
        typeof customer.name !== 'string' ||
        typeof customer.email !== 'string' ||
        !customer.name.trim() ||
        !customer.email.trim()
      ) {
        return sendJson(res, 400, {
          error: 'Full name and email are required.'
        })
      }

      if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
        return sendJson(res, 400, {
          error: 'Order must contain at least one item'
        })
      }

      const orderItems = []

      for (const requestedItem of requestedItems) {
        const productId = Number(requestedItem.productId)
        const quantity = requestedItem.quantity === undefined
          ? 1
          : Number(requestedItem.quantity)

        if (
          !Number.isInteger(productId) ||
          !Number.isInteger(quantity) ||
          quantity <= 0
        ) {
          return sendJson(res, 400, {
            error: 'Invalid order item'
          })
        }

        const product = products.find(product => product.id === productId)

        if (!product) {
          return sendJson(res, 404, {
            error: `Product ${productId} not found`
          })
        }

        orderItems.push({
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity
        })
      }

      const subtotal = orderItems.reduce((sum, item) => {
        return sum + item.price * item.quantity
      }, 0)
      const promoCode = cartSession.appliedPromoCode
      const discount = promoCode === 'SAVE10' ? subtotal * 0.1 : 0
      const total = subtotal - discount

      const order = {
        id: nextOrderId++,
        customer: {
          name: customer.name.trim(),
          email: customer.email.trim()
        },
        items: orderItems,
        promoCode,
        subtotal,
        discount,
        total,
        status: 'confirmed',
        createdAt: new Date().toISOString()
      }

      orders.push(order)

      return sendJson(res, 201, order)
    } catch {
      return sendJson(res, 400, {
        error: 'Invalid JSON'
      })
    }
  }

  // GET /api/orders/:id
  if (req.method === 'GET' && pathname.startsWith('/api/orders/')) {
    const id = Number(pathname.split('/').pop())

    if (!Number.isInteger(id)) {
      return sendJson(res, 400, {
        error: 'Invalid order id'
      })
    }

    const order = orders.find(order => order.id === id)

    if (!order) {
      return sendJson(res, 404, {
        error: 'Order not found'
      })
    }

    return sendJson(res, 200, order)
  }

  // ---------------------------------------------------------------------------
  // Unknown API endpoint
  // ---------------------------------------------------------------------------

  if (pathname.startsWith('/api/')) {
    return sendJson(res, 404, {
      error: 'API endpoint not found'
    })
  }

  // ---------------------------------------------------------------------------
  // Static frontend
  // ---------------------------------------------------------------------------

  const urlPath = pathname === '/' ? '/index.html' : pathname
  const filePath = path.join(publicDir, urlPath)

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403)
    return res.end('Forbidden')
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8'
      })

      return res.end('Not found')
    }

    res.writeHead(200, {
      'Content-Type':
        types[path.extname(filePath)] ||
        'application/octet-stream'
    })

    res.end(data)
  })
}).listen(port, () => {
  console.log(`QA Shop API-ready running at http://localhost:${port}`)
})