<script setup>
import { computed, onMounted, ref, watch, nextTick } from 'vue';

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  length: {
    type: Number,
    default: 6
  },
  disabled: {
    type: Boolean,
    default: false
  },
  autofocus: {
    type: Boolean,
    default: false
  },
  id: {
    type: String,
    default: ''
  },
  wrapperClass: {
    type: String,
    default: ''
  },
  inputClass: {
    type: String,
    default: ''
  },
  name: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['update:modelValue', 'complete']);

const inputs = ref([]);
const isPasting = ref(false);

const internalValue = computed(() => {
  const v = (props.modelValue || '').replace(/\D/g, '');
  return v.slice(0, props.length);
});

const lastComplete = ref('');

function focusInput(index) {
  const el = inputs.value[index];
  if (el && typeof el.focus === 'function') {
    el.focus();
    if (typeof el.select === 'function') {
      el.select();
    }
  }
}

onMounted(() => {
  if (props.autofocus) {
    focusInput(0);
  }
});

watch(internalValue, v => {
  if (v.length === props.length && v !== lastComplete.value) {
    lastComplete.value = v;
    emit('complete', v);
  }
  if (v.length < props.length) {
    lastComplete.value = '';
  }
});

function updateValueFromDigits(startIndex, digits) {
  const length = props.length;
  const current = internalValue.value.padEnd(length, '');
  const chars = current.split('');
  for (let i = 0; i < digits.length && startIndex + i < length; i += 1) {
    chars[startIndex + i] = digits[i];
  }
  const next = chars.join('').slice(0, length);
  emit('update:modelValue', next);
  return next;
}

function clearAt(index, moveToPrevious) {
  const length = props.length;
  const current = internalValue.value.padEnd(length, '');
  const chars = current.split('');
  if (chars[index]) {
    chars[index] = '';
  } else if (moveToPrevious && index > 0) {
    chars[index - 1] = '';
    index -= 1;
  }
  const next = chars.join('').slice(0, length);
  emit('update:modelValue', next);
  if (moveToPrevious && index >= 0) {
    focusInput(index);
  }
}

function onInput(index, event) {
  if (props.disabled) {
    event.preventDefault();
    return;
  }
  
  // Skip if we're in the middle of a paste operation
  if (isPasting.value) {
    return;
  }
  
  const raw = event.target.value || '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) {
    clearAt(index, false);
    return;
  }
  const next = updateValueFromDigits(index, digits);
  event.target.value = digits[0] || '';
  const advanceBy = digits.length;
  const length = props.length;
  const nextIndex = index + advanceBy;
  if (nextIndex < length) {
    focusInput(nextIndex);
  } else if (next.length === length) {
    event.target.blur();
  }
}

function onKeydown(index, event) {
  if (props.disabled) {
    event.preventDefault();
    return;
  }
  const key = event.key;
  if (key === 'Backspace') {
    event.preventDefault();
    clearAt(index, true);
  } else if (key === 'ArrowLeft') {
    event.preventDefault();
    if (index > 0) {
      focusInput(index - 1);
    }
  } else if (key === 'ArrowRight') {
    event.preventDefault();
    if (index + 1 < props.length) {
      focusInput(index + 1);
    }
  } else if (key === ' ' || key === 'Tab' || key === 'Enter') {
  } else if (!/^\d$/.test(key)) {
    event.preventDefault();
  }
}

function onPaste(index, event) {
  if (props.disabled) {
    event.preventDefault();
    return;
  }
  
  event.preventDefault();
  event.stopPropagation();
  
  isPasting.value = true;
  
  const text = event.clipboardData?.getData('text') || '';
  const digits = text.replace(/\D/g, '');
  
  console.log('Paste detected:', { text, digits, index });
  
  if (!digits) {
    isPasting.value = false;
    return;
  }
  
  // Fill from the beginning with the pasted digits
  const fillValue = digits.slice(0, props.length);
  emit('update:modelValue', fillValue);
  
  // Use nextTick to ensure Vue has updated the DOM
  nextTick(() => {
    // Focus the appropriate box
    const focusIndex = Math.min(fillValue.length, props.length - 1);
    focusInput(focusIndex);
    
    // Reset pasting flag after a short delay
    setTimeout(() => {
      isPasting.value = false;
    }, 100);
  });
}

function setInputRef(el, index) {
  if (el) {
    inputs.value[index] = el;
  }
}
</script>

<template>
  <div :class="['otp-input-row', wrapperClass]">
    <input
      v-for="(_, index) in length"
      :key="index"
      :ref="el => setInputRef(el, index)"
      type="text"
      inputmode="numeric"
      :autocomplete="index === 0 ? 'one-time-code' : 'off'"
      :id="props.id ? (index === 0 ? props.id : `${props.id}-${index}`) : undefined"
      :name="name || undefined"
      maxlength="1"
      :disabled="disabled"
      :class="['otp-input-box', inputClass]"
      :value="internalValue[index] || ''"
      @input="event => onInput(index, event)"
      @keydown="event => onKeydown(index, event)"
      @paste="event => onPaste(index, event)"
    />
  </div>
</template>

<style scoped>
.otp-input-row {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
}

.otp-input-box {
  width: 2.5rem;
  height: 2.5rem;
  text-align: center;
  font-size: 1.25rem;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
}

.otp-input-box:focus {
  outline: none;
  border-color: var(--vt-c-green-1);
  box-shadow: 0 0 0 1px var(--vt-c-green-1);
}
</style>
