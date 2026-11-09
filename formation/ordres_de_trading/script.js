document.addEventListener('DOMContentLoaded', () => {
  
  // Navbar Scrolled Effect
  const navbar = document.querySelector('.navbar');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.style.background = 'rgba(10, 14, 23, 0.95)';
      navbar.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.5)';
    } else {
      navbar.style.background = 'rgba(10, 14, 23, 0.8)';
      navbar.style.boxShadow = 'none';
    }
  });

  // Mobile Menu Toggle
  const mobileBtn = document.querySelector('.mobile-menu-btn');
  const navLinks = document.querySelector('.nav-links');
  
  if (mobileBtn && navLinks) {
    mobileBtn.addEventListener('click', () => {
      navLinks.classList.toggle('active');
    });
    
    // Close menu when clicking a link
    const navItemsList = document.querySelectorAll('.nav-links a');
    navItemsList.forEach(item => {
      item.addEventListener('click', () => {
        if (window.innerWidth <= 900) {
          navLinks.classList.remove('active');
        }
      });
    });
  }

  // Active Link State Configuration
  const sections = document.querySelectorAll('section, header');
  const navItems = document.querySelectorAll('.nav-links a');

  window.addEventListener('scroll', () => {
    let current = '';
    const scrollY = window.pageYOffset;

    sections.forEach(section => {
      const sectionHeight = section.offsetHeight;
      const sectionTop = section.offsetTop - 100;
      if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
        current = section.getAttribute('id');
      }
    });

    navItems.forEach(item => {
      item.style.color = 'var(--text-main)';
      item.style.background = 'transparent';
      if (item.getAttribute('href').includes(current) && current !== '') {
        item.style.color = 'var(--primary-color)';
        item.style.background = 'var(--glass-bg)';
      }
    });
  });

  // Fake Price Ticker for Hero Section
  const priceDisplay = document.querySelector('.card-price');
  let currentPrice = 50000.00;

  setInterval(() => {
    // Generate random small float between -15.00 and +15.00
    const change = (Math.random() * 30 - 15);
    currentPrice += change;
    
    // Format to 2 decimal places
    const formattedPrice = currentPrice.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    // Update Text
    priceDisplay.textContent = formattedPrice;

    // Add color flash animation
    if (change > 0) {
      priceDisplay.classList.add('price-up');
      priceDisplay.classList.remove('price-down');
    } else {
      priceDisplay.classList.add('price-down');
      priceDisplay.classList.remove('price-up');
    }

  }, 2000);

  // Buy/Sell Button Interaction
  const btnBuy = document.querySelector('.btn-buy');
  const btnSell = document.querySelector('.btn-sell');

  if (btnBuy) {
    btnBuy.addEventListener('click', () => {
      btnBuy.textContent = 'تم الشراء!';
      btnBuy.style.background = '#059669';
      setTimeout(() => {
        btnBuy.textContent = 'شراء (Buy)';
        btnBuy.style.background = 'var(--color-green)';
      }, 1500);
    });
  }

  if (btnSell) {
    btnSell.addEventListener('click', () => {
      btnSell.textContent = 'تم البيع!';
      btnSell.style.background = '#dc2626';
      setTimeout(() => {
        btnSell.textContent = 'بيع (Sell)';
        btnSell.style.background = 'var(--color-red)';
      }, 1500);
    });
  }
});
