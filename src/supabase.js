import { createClient } from '@supabase/supabase-js'

// Cleans common mistakes: spaces, trailing "/", or "/rest/v1" pasted at the end
const url = (import.meta.env.VITE_SUPABASE_URL || '')
  .trim()
  .replace(/\/(rest|auth)\/v1.*$/, '')
  .replace(/\/+$/, '')
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

export const configOk = url.startsWith('https://') && url.endsWith('.supabase.co') && key.length > 30
export const supabase = createClient(configOk ? url : 'https://missing.supabase.co', key || 'missing-key')