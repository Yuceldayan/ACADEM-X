document.addEventListener("DOMContentLoaded", function () {
    // Eğer responsive navbar kullanılacaksa, nav-toggle ile menüyü açıp kapatabilirsiniz.
    const navToggle = document.querySelector(".nav-toggle");
    const navMenu = document.querySelector(".nav-menu");
    if (navToggle) {
      navToggle.addEventListener("click", function () {
        navMenu.classList.toggle("active");
      });
    }
  });
  