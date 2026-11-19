/** 五维评价标签：5=夯（封神）… 1=拉（避雷），对应网上很火的「从夯到拉」 */
export const RATING_LABELS: Record<number, string> = {
  5: '夯',
  4: '可',
  3: '普',
  2: '寄',
  1: '拉',
}

export const RATING_DESC: Record<number, string> = {
  5: '封神！闭眼入',
  4: '不错，挺好用',
  3: '就这？一般般',
  2: '拉胯，绷不住',
  1: '纯雷，大无语',
}

/** 各等级专属配色（从夯到拉，肉眼可区分的五种颜色） */
export const RATING_COLORS: Record<number, string> = {
  5: '#f59e0b', // 夯 · 琥珀金
  4: '#22c55e', // 可 · 绿
  3: '#64748b', // 普 · 蓝灰
  2: '#8b5cf6', // 寄 · 紫
  1: '#ef4444', // 拉 · 红
}
