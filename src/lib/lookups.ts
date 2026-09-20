import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Branch, Category, Product, Supplier, Role } from '@/types/supabase';

export function useBranches(activeOnly = false) {
  return useQuery({
    queryKey: ['branches', { activeOnly }],
    queryFn: async (): Promise<Branch[]> => {
      let filter = supabase.from('branches').select('*');
      if (activeOnly) filter = filter.eq('is_active', true);
      const { data, error } = await filter.order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCategories(activeOnly = false) {
  return useQuery({
    queryKey: ['categories', { activeOnly }],
    queryFn: async (): Promise<Category[]> => {
      let filter = supabase.from('categories').select('*');
      if (activeOnly) filter = filter.eq('is_active', true);
      const { data, error } = await filter.order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSuppliers(activeOnly = false) {
  return useQuery({
    queryKey: ['suppliers', { activeOnly }],
    queryFn: async (): Promise<Supplier[]> => {
      let filter = supabase.from('suppliers').select('*');
      if (activeOnly) filter = filter.eq('is_active', true);
      const { data, error } = await filter.order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProducts(activeOnly = false) {
  return useQuery({
    queryKey: ['products-lookup', { activeOnly }],
    queryFn: async (): Promise<Product[]> => {
      let filter = supabase.from('products').select('*');
      if (activeOnly) filter = filter.eq('is_active', true);
      const { data, error } = await filter.order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: async (): Promise<Role[]> => {
      const { data, error } = await supabase.from('roles').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}
