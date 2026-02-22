(() => {
  if (!customElements.get('localization-form-component')) {
    class LocalizationFormComponent extends HTMLElement {
      connectedCallback() {
        this.form = this.querySelector('form.localization-form');
        this.countryList = this.querySelector('[data-localization-ref="countryList"]');
        this.countryInput = this.querySelector('[data-localization-ref="countryInput"]');
        this.searchInput = this.querySelector('[data-localization-ref="search"]');
        this.resetButton = this.querySelector('[data-localization-ref="resetButton"]');
        this.liveRegion = this.querySelector('[data-localization-ref="liveRegion"]');
        this.noResultsMessage = this.querySelector('[data-localization-ref="noResultsMessage"]');
        this.languageInput = this.querySelector('[data-localization-ref="languageInput"]');
        this.countryItems = Array.from(this.querySelectorAll('[data-localization-ref="countryItem"]'));

        this.handleCountryClick = this.handleCountryClick.bind(this);
        this.handleCountryKeydown = this.handleCountryKeydown.bind(this);
        this.handleSearchKeydown = this.handleSearchKeydown.bind(this);
        this.handleSearchInput = this.handleSearchInput.bind(this);
        this.handleResetFilter = this.handleResetFilter.bind(this);
        this.handleLanguageChange = this.handleLanguageChange.bind(this);
        this.handleCountryListScroll = this.handleCountryListScroll.bind(this);

        if (this.countryList) {
          this.countryList.addEventListener('click', this.handleCountryClick);
          this.countryList.addEventListener('keydown', this.handleCountryKeydown);
          this.countryList.addEventListener('scroll', this.handleCountryListScroll);
        }

        if (this.searchInput) {
          this.searchInput.addEventListener('input', this.handleSearchInput);
          this.searchInput.addEventListener('keydown', this.handleSearchKeydown);
        }

        if (this.resetButton) {
          this.resetButton.addEventListener('click', this.handleResetFilter);
        }

        if (this.languageInput) {
          this.languageInput.addEventListener('change', this.handleLanguageChange);
        }
      }

      disconnectedCallback() {
        if (this.countryList) {
          this.countryList.removeEventListener('click', this.handleCountryClick);
          this.countryList.removeEventListener('keydown', this.handleCountryKeydown);
          this.countryList.removeEventListener('scroll', this.handleCountryListScroll);
        }

        if (this.searchInput) {
          this.searchInput.removeEventListener('input', this.handleSearchInput);
          this.searchInput.removeEventListener('keydown', this.handleSearchKeydown);
        }

        if (this.resetButton) {
          this.resetButton.removeEventListener('click', this.handleResetFilter);
        }

        if (this.languageInput) {
          this.languageInput.removeEventListener('change', this.handleLanguageChange);
        }
      }

      normalizeString(value) {
        return String(value || '').trim().toLowerCase();
      }

      getVisibleItems() {
        return this.countryItems.filter((item) => !item.hasAttribute('hidden'));
      }

      setSelectedItem(item) {
        this.countryItems.forEach((countryItem) => {
          countryItem.setAttribute('aria-selected', countryItem === item ? 'true' : 'false');
        });

        if (this.searchInput) {
          const activeDescendant = item ? item.id : '';
          this.searchInput.setAttribute('aria-activedescendant', activeDescendant);
        }
      }

      changeCountryFocus(direction) {
        const visibleItems = this.getVisibleItems();
        if (!visibleItems.length) return;

        const selectedIndex = visibleItems.findIndex((item) => item.getAttribute('aria-selected') === 'true');
        const focusedIndex = selectedIndex >= 0 ? selectedIndex : visibleItems.findIndex((item) => item === document.activeElement);
        const baseIndex = focusedIndex >= 0 ? focusedIndex : 0;
        let nextIndex = baseIndex;

        if (direction === 'UP') {
          nextIndex = baseIndex > 0 ? baseIndex - 1 : visibleItems.length - 1;
        } else {
          nextIndex = baseIndex < visibleItems.length - 1 ? baseIndex + 1 : 0;
        }

        const nextItem = visibleItems[nextIndex];
        this.setSelectedItem(nextItem);
        nextItem.focus();
      }

      filterCountries() {
        if (!this.searchInput) return;

        const searchValue = this.normalizeString(this.searchInput.value);
        let visibleCount = 0;

        this.countryItems.forEach((item) => {
          const name = this.normalizeString(item.dataset.name);
          const aliases = this.normalizeString(item.dataset.aliases);
          const iso = this.normalizeString(item.dataset.iso);
          const currency = this.normalizeString(item.dataset.currency);

          const isMatch =
            searchValue === '' ||
            name.includes(searchValue) ||
            aliases.split(',').some((alias) => this.normalizeString(alias).includes(searchValue)) ||
            iso === searchValue ||
            currency.includes(searchValue);

          item.toggleAttribute('hidden', !isMatch);
          if (isMatch) visibleCount += 1;
        });

        const wrapper = this.querySelector('.country-selector-form__wrapper');
        if (wrapper) {
          wrapper.classList.toggle('is-searching', searchValue !== '');
        }

        if (this.resetButton) {
          this.resetButton.toggleAttribute('hidden', searchValue === '');
        }

        const popularCountries = this.querySelector('.popular-countries');
        if (popularCountries) {
          popularCountries.toggleAttribute('hidden', searchValue !== '');
        }

        if (this.noResultsMessage) {
          this.noResultsMessage.toggleAttribute('hidden', visibleCount > 0);
        }

        if (this.liveRegion) {
          const labelTemplate = this.dataset.labelResultsCount || 'Found [count] country or region results.';
          this.liveRegion.textContent = labelTemplate.replace('[count]', String(visibleCount));
        }

        this.setSelectedItem(null);

        if (this.countryList) {
          this.countryList.scrollTop = 0;
        }
      }

      handleSearchInput() {
        this.filterCountries();
      }

      handleSearchKeydown(event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          return;
        }
        this.handleCountryKeydown(event);
      }

      handleCountryKeydown(event) {
        if (!this.countryList) return;

        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          event.stopPropagation();
          this.changeCountryFocus(event.key === 'ArrowUp' ? 'UP' : 'DOWN');
          return;
        }

        if (event.key === 'Enter') {
          const activeItem = this.countryItems.find((item) => item.getAttribute('aria-selected') === 'true');
          if (!activeItem) return;
          event.preventDefault();
          event.stopPropagation();
          this.selectCountry(activeItem.dataset.value);
        }
      }

      handleCountryListScroll(event) {
        const countryFilter = this.querySelector('.country-filter');
        if (!countryFilter) return;
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        countryFilter.classList.toggle('is-scrolled', target.scrollTop > 0);
      }

      handleResetFilter(event) {
        event.preventDefault();
        if (!this.searchInput) return;
        this.searchInput.value = '';
        this.filterCountries();
        this.searchInput.focus();
      }

      handleCountryClick(event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const countryItem = target.closest('[data-localization-ref="countryItem"]');
        if (!countryItem || countryItem.hasAttribute('hidden')) return;
        this.selectCountry(countryItem.dataset.value);
      }

      selectCountry(countryCode) {
        if (!countryCode || !this.countryInput || !this.form) return;
        this.countryInput.value = countryCode;
        this.form.submit();
      }

      handleLanguageChange(event) {
        const target = event.target;
        if (!(target instanceof HTMLSelectElement) || !this.form || !this.languageInput) return;
        this.languageInput.value = target.value;
        this.form.submit();
      }

      focusSearchInput() {
        if (this.searchInput) {
          this.searchInput.focus();
          return;
        }

        const firstItem = this.getVisibleItems()[0];
        if (firstItem) {
          firstItem.focus();
        }
      }

      resetForm() {
        if (!this.searchInput || this.searchInput.value === '') return;
        this.searchInput.value = '';
        this.filterCountries();
      }
    }

    customElements.define('localization-form-component', LocalizationFormComponent);
  }

  if (!customElements.get('dropdown-localization-component')) {
    class DropdownLocalizationComponent extends HTMLElement {
      connectedCallback() {
        this.button = this.querySelector('[data-localization-ref="button"]');
        this.panel = this.querySelector('[data-localization-ref="panel"]');
        this.localizationForm = this.querySelector('localization-form-component');
        this.hideTimer = null;

        this.toggleSelector = this.toggleSelector.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.handleDocumentClick = this.handleDocumentClick.bind(this);

        if (this.button) {
          this.button.addEventListener('click', this.toggleSelector);
        }
      }

      disconnectedCallback() {
        if (this.hideTimer) {
          window.clearTimeout(this.hideTimer);
          this.hideTimer = null;
        }

        if (this.button) {
          this.button.removeEventListener('click', this.toggleSelector);
        }

        document.removeEventListener('click', this.handleDocumentClick);
        document.removeEventListener('keyup', this.handleKeyUp);
      }

      get isOpen() {
        return Boolean(this.panel && !this.panel.hasAttribute('hidden'));
      }

      toggleSelector(event) {
        event.preventDefault();
        if (this.isOpen) {
          this.hidePanel();
        } else {
          this.showPanel();
        }
      }

      showPanel() {
        if (!this.panel || !this.button || this.isOpen) return;

        if (this.hideTimer) {
          window.clearTimeout(this.hideTimer);
          this.hideTimer = null;
        }

        this.panel.removeAttribute('hidden');
        this.button.setAttribute('aria-expanded', 'true');
        this.setAttribute('data-open', 'true');

        window.requestAnimationFrame(() => {
          this.panel.classList.add('is-active');
        });

        document.addEventListener('click', this.handleDocumentClick);
        document.addEventListener('keyup', this.handleKeyUp);

        window.setTimeout(() => {
          if (this.localizationForm && typeof this.localizationForm.focusSearchInput === 'function') {
            this.localizationForm.focusSearchInput();
          }
        }, 0);
      }

      hidePanel() {
        if (!this.panel || !this.button || !this.isOpen) return;

        this.button.setAttribute('aria-expanded', 'false');
        this.removeAttribute('data-open');
        this.panel.classList.remove('is-active');

        if (this.localizationForm && typeof this.localizationForm.resetForm === 'function') {
          this.localizationForm.resetForm();
        }

        document.removeEventListener('click', this.handleDocumentClick);
        document.removeEventListener('keyup', this.handleKeyUp);

        if (this.hideTimer) {
          window.clearTimeout(this.hideTimer);
        }

        this.hideTimer = window.setTimeout(() => {
          if (!this.panel.classList.contains('is-active')) {
            this.panel.setAttribute('hidden', '');
          }
        }, 220);
      }

      handleKeyUp(event) {
        if (event.key !== 'Escape') return;
        this.hidePanel();
        if (this.button) {
          this.button.focus();
        }
      }

      handleDocumentClick(event) {
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (this.contains(target)) return;
        this.hidePanel();
      }
    }

    customElements.define('dropdown-localization-component', DropdownLocalizationComponent);
  }
})();
