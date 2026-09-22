let products = []
let cart = {
  items: [],
  promoCode: null,
  subtotal: 0,
  discount: 0,
  total: 0
}

const productRoot = document.querySelector('#products')
const search = document.querySelector('#search')
const status = document.querySelector('#status')
const cartCount = document.querySelector('#cart-count')
const cartPanel = document.querySelector('#cart-panel')
const cartItems = document.querySelector('#cart-items')
const cartTotal = document.querySelector('#cart-total')
const cartSubtotal = document.querySelector('#cart-subtotal')
const cartDiscount = document.querySelector('#cart-discount')
const cartTotals = document.querySelector('#cart-totals')
const promoControls = document.querySelector('#promo-controls')
const promoCode = document.querySelector('#promo-code')
const applyPromo = document.querySelector('#apply-promo')
const promoError = document.querySelector('#promo-error')
const checkoutPanel = document.querySelector('#checkout-panel')
const checkoutError = document.querySelector('#checkout-error')
const success = document.querySelector('#success')

function money(value) {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR'
  }).format(value)
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  })

  const body = await response.json()

  if (!response.ok) {
    throw new Error(body.error || 'Something went wrong.')
  }

  return body
}

function renderProducts(list) {
  productRoot.innerHTML = ''

  list.forEach(product => {
    const article = document.createElement('article')
    article.className = 'card'
    article.dataset.testid = 'product-card'

    article.innerHTML = `
      <div class="product-art" aria-hidden="true">${product.name.slice(0, 1)}</div>
      <h2>${product.name}</h2>
      <p>${money(product.price)}</p>
      <button type="button" data-add="${product.id}">
        Add ${product.name} to cart
      </button>
    `

    productRoot.appendChild(article)
  })

  status.textContent =
    `${list.length} product${list.length === 1 ? '' : 's'} found`
}

function renderCart() {
  const itemCount = cart.items.reduce(
    (sum, item) => sum + item.quantity,
    0
  )

  cartCount.textContent = itemCount

  cartItems.innerHTML = cart.items.length
    ? cart.items
        .map(item => `
          <p>
            ${item.name}
            <span>
              ${item.quantity > 1 ? `${item.quantity} × ` : ''}
              ${money(item.price)}
            </span>
          </p>
        `)
        .join('')
    : '<p>Your cart is empty.</p>'

  promoControls.classList.toggle('hidden', !cart.items.length)
  cartTotals.classList.toggle('hidden', !cart.promoCode)

  promoCode.disabled = Boolean(cart.promoCode)
  applyPromo.disabled = Boolean(cart.promoCode) || !promoCode.value
  cartSubtotal.textContent = money(cart.subtotal)
  cartDiscount.textContent = money(cart.discount)
  cartTotal.textContent = money(cart.total)
}

async function loadProducts() {
  products = await apiRequest('/api/products')
  renderProducts(products)
}

async function loadCart() {
  cart = await apiRequest('/api/cart')
  renderCart()
}

productRoot.addEventListener('click', async e => {
  const id = Number(e.target.dataset.add)

  if (!id) return

  try {
    cart = await apiRequest('/api/cart/items', {
      method: 'POST',
      body: JSON.stringify({
        productId: id,
        quantity: 1
      })
    })

    renderCart()
  } catch (error) {
    status.textContent = error.message
  }
})

search.addEventListener('input', () => {
  const query = search.value.trim().toLowerCase()

  renderProducts(
    products.filter(product =>
      product.name.toLowerCase().includes(query)
    )
  )
})

promoCode.addEventListener('input', () => {
  applyPromo.disabled = Boolean(cart.promoCode) || !promoCode.value
})

applyPromo.addEventListener('click', async () => {
  promoError.textContent = ''

  try {
    cart = await apiRequest('/api/cart/promo', {
      method: 'POST',
      body: JSON.stringify({
        code: promoCode.value
      })
    })

    renderCart()
  } catch (error) {
    promoError.textContent = error.message
  }
})

document.querySelector('#cart-button').addEventListener('click', async () => {
  try {
    await loadCart()
    cartPanel.classList.remove('hidden')
  } catch (error) {
    status.textContent = error.message
  }
})

document.querySelector('#close-cart').addEventListener('click', () => {
  cartPanel.classList.add('hidden')
})

document.querySelector('#checkout').addEventListener('click', () => {
  if (!cart.items.length) return

  cartPanel.classList.add('hidden')
  checkoutPanel.classList.remove('hidden')
})

document.querySelector('#checkout-form').addEventListener('submit', async e => {
  e.preventDefault()

  const name = document.querySelector('#full-name').value.trim()
  const email = document.querySelector('#email').value.trim()

  checkoutError.textContent = ''

  try {
    await apiRequest('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        customer: {
          name,
          email
        },
        items: cart.items.map(item => ({
          productId: item.productId,
          quantity: item.quantity
        }))
      })
    })

    checkoutPanel.classList.add('hidden')
    success.classList.remove('hidden')
  } catch (error) {
    checkoutError.textContent = error.message
  }
})

async function init() {
  try {
    await Promise.all([
      loadProducts(),
      loadCart()
    ])
  } catch (error) {
    status.textContent = error.message
  }
}

init()