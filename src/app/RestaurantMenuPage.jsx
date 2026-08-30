import { useEffect, useState } from 'react'
import { useBusiness } from '../context/BusinessContext'
import {
  listMenuCategories,
  createMenuCategory,
  listMenuItems,
  createMenuItem,
  updateMenuItem,
  setMenuItemActive,
} from '../services/restaurant'
import Card from '../components/Card'
import Button from '../components/Button'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import Input from '../components/Input'
import Skeleton from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import { usePermission } from '../hooks/usePermission'

const EMPTY_ITEM = { name: '', description: '', price: 0, category_id: '' }

export default function RestaurantMenuPage() {
  const { activeBusinessId } = useBusiness()
  const { allowed: canManage } = usePermission('settings.manage')
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [categorySubmitting, setCategorySubmitting] = useState(false)

  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [itemForm, setItemForm] = useState(EMPTY_ITEM)
  const [itemSubmitting, setItemSubmitting] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    const [{ data: cats }, { data: menuItems }] = await Promise.all([listMenuCategories(activeBusinessId), listMenuItems(activeBusinessId)])
    setCategories(cats ?? [])
    setItems(menuItems ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (activeBusinessId) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBusinessId])

  const handleCreateCategory = async (event) => {
    event.preventDefault()
    setCategorySubmitting(true)
    await createMenuCategory(activeBusinessId, { name: categoryName, sort_order: categories.length })
    setCategorySubmitting(false)
    setCategoryModalOpen(false)
    setCategoryName('')
    load()
  }

  const openCreateItem = () => {
    setEditingItem(null)
    setItemForm({ ...EMPTY_ITEM, category_id: categories[0]?.id ?? '' })
    setError('')
    setItemModalOpen(true)
  }

  const openEditItem = (item) => {
    setEditingItem(item)
    setItemForm({ name: item.name, description: item.description ?? '', price: item.price, category_id: item.category_id ?? '' })
    setError('')
    setItemModalOpen(true)
  }

  const handleSubmitItem = async (event) => {
    event.preventDefault()
    setItemSubmitting(true)
    setError('')
    const payload = {
      name: itemForm.name,
      description: itemForm.description || null,
      price: Number(itemForm.price),
      category_id: itemForm.category_id || null,
    }
    const { error: err } = editingItem ? await updateMenuItem(editingItem.id, payload) : await createMenuItem(activeBusinessId, payload)
    setItemSubmitting(false)
    if (err) {
      setError('Kaydedilemedi.')
      return
    }
    setItemModalOpen(false)
    load()
  }

  const toggleActive = async (item) => {
    await setMenuItemActive(item.id, !item.is_active)
    load()
  }

  const grouped = categories.map((cat) => ({ ...cat, items: items.filter((i) => i.category_id === cat.id) }))
  const uncategorized = items.filter((i) => !i.category_id)

  return (
    <div>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Menü</h1>
          <p className="mt-1 text-sm text-slate-500">Kategoriler ve ürünler.</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCategoryModalOpen(true)}>
              + Kategori
            </Button>
            <Button disabled={categories.length === 0} onClick={openCreateItem}>
              + Yeni Ürün
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="mt-6 space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Henüz menü kategorisi yok"
            description="Örn. Başlangıçlar, Ana Yemekler, Tatlılar, İçecekler"
            action={canManage && <Button onClick={() => setCategoryModalOpen(true)}>+ Kategori Ekle</Button>}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {grouped.map((cat) => (
            <div key={cat.id}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">{cat.name}</h2>
              {cat.items.length === 0 ? (
                <p className="text-sm text-slate-400">Bu kategoride ürün yok.</p>
              ) : (
                <Card className="overflow-hidden">
                  <div className="divide-y divide-slate-100">
                    {cat.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between px-5 py-3">
                        <div>
                          <p className="font-medium text-ink">{item.name}</p>
                          {item.description && <p className="text-xs text-slate-500">{item.description}</p>}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-ink">{Number(item.price).toLocaleString('tr-TR')} ₺</span>
                          <Badge status={item.is_active ? 'active' : 'cancelled'}>{item.is_active ? 'Aktif' : 'Pasif'}</Badge>
                          {canManage && (
                            <>
                              <button onClick={() => openEditItem(item)} className="text-xs font-medium text-teal hover:text-teal-dark">
                                Düzenle
                              </button>
                              <button onClick={() => toggleActive(item)} className="text-xs font-medium text-slate-500 hover:text-ink">
                                {item.is_active ? 'Pasifleştir' : 'Aktifleştir'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          ))}

          {uncategorized.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Kategorisiz</h2>
              <Card className="overflow-hidden">
                <div className="divide-y divide-slate-100">
                  {uncategorized.map((item) => (
                    <div key={item.id} className="flex items-center justify-between px-5 py-3">
                      <p className="font-medium text-ink">{item.name}</p>
                      <span className="text-sm font-medium text-ink">{Number(item.price).toLocaleString('tr-TR')} ₺</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      <Modal open={categoryModalOpen} title="Yeni Kategori" onClose={() => setCategoryModalOpen(false)}>
        <form onSubmit={handleCreateCategory} className="space-y-4">
          <Input id="category-name" label="Kategori Adı" required value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="Örn. Ana Yemekler" />
          <Button type="submit" disabled={categorySubmitting} className="w-full">
            {categorySubmitting ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </form>
      </Modal>

      <Modal open={itemModalOpen} title={editingItem ? 'Ürünü Düzenle' : 'Yeni Ürün'} onClose={() => setItemModalOpen(false)}>
        <form onSubmit={handleSubmitItem} className="space-y-4">
          <Input id="item-name" label="Ürün Adı" required value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="item-category">
              Kategori
            </label>
            <select
              id="item-category"
              value={itemForm.category_id}
              onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <Input id="item-price" label="Fiyat (₺)" type="number" min={0} step="0.01" required value={itemForm.price} onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })} />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="item-description">
              Açıklama
            </label>
            <textarea
              id="item-description"
              value={itemForm.description}
              onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={itemSubmitting} className="w-full">
            {itemSubmitting ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
