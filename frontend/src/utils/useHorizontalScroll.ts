import { useCallback, useRef } from 'react';

/**
 * 表格横向滚动 hook
 * 鼠标放在表格区域时，滚轮左右滑动；离开后恢复正常上下滑动。
 */
export function useHorizontalScroll<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  const onWheel = useCallback((e: React.WheelEvent<T>) => {
    const el = ref.current;
    if (!el) return;
    // 判断是否真的可以横向滚动（有横向溢出）
    const canScrollX = el.scrollWidth > el.clientWidth;
    if (!canScrollX) return;

    // 如果用户按了 shift，保持默认（浏览器可能处理横向）
    if (e.shiftKey) return;

    // 滚轮 deltaY 用于横向滚动，deltaX 保留（触控板横向手势）
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      // 触控板横向手势，交给默认行为
      return;
    }

    // 阻止默认的纵向滚动，转为横向
    e.preventDefault();
    el.scrollLeft += e.deltaY;
  }, []);

  return { ref, onWheel };
}
