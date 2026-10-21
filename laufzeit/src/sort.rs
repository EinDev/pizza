//! Port von V8s TimSort (third_party/v8/builtins/array-sort.tq), damit die Folge der
//! Vergleichsaufrufe – und damit Schritte/Ausgaben im Vergleicher – exakt wie im Interpreter ist.

use crate::wert::W;
use alloc::vec::Vec;

const MIN_GALLOP: i64 = 7;

struct S<'a> {
    a: &'a mut Vec<W>,
    cmp: &'a mut dyn FnMut(W, W) -> Option<f64>,
    min_gallop: i64,
    base: Vec<i64>,
    len: Vec<i64>,
}

/// Gibt false zurück, wenn der Vergleicher geworfen hat.
pub fn sortiere(a: &mut Vec<W>, cmp: &mut dyn FnMut(W, W) -> Option<f64>) -> bool {
    let n = a.len() as i64;
    if n < 2 { return true; }
    let mut s = S { a, cmp, min_gallop: MIN_GALLOP, base: Vec::new(), len: Vec::new() };
    s.timsort(n).is_some()
}

fn min_run(mut n: i64) -> i64 {
    let mut r = 0;
    while n >= 64 { r |= n & 1; n >>= 1; }
    n + r
}

impl<'a> S<'a> {
    fn c(&mut self, x: W, y: W) -> Option<f64> { (self.cmp)(x, y) }

    fn timsort(&mut self, length: i64) -> Option<()> {
        let mut remaining = length;
        let mut low = 0;
        let min_run_length = min_run(remaining);
        while remaining != 0 {
            let mut cur = self.count_and_make_run(low, low + remaining)?;
            if cur < min_run_length {
                let forced = if min_run_length < remaining { min_run_length } else { remaining };
                self.binary_insertion_sort(low, low + cur, low + forced)?;
                cur = forced;
            }
            self.base.push(low);
            self.len.push(cur);
            self.merge_collapse()?;
            low += cur;
            remaining -= cur;
        }
        self.merge_force_collapse()
    }

    fn count_and_make_run(&mut self, low_arg: i64, high: i64) -> Option<i64> {
        let low = low_arg + 1;
        if low == high { return Some(1); }
        let mut run_length = 2;
        let element_low = self.a[low as usize];
        let element_low_pre = self.a[(low - 1) as usize];
        let order = self.c(element_low, element_low_pre)?;
        let descending = order < 0.0;
        let mut previous = element_low;
        let mut idx = low + 1;
        while idx < high {
            let current = self.a[idx as usize];
            let order = self.c(current, previous)?;
            if descending { if order >= 0.0 { break; } } else if order < 0.0 { break; }
            previous = current;
            run_length += 1;
            idx += 1;
        }
        if descending { self.a[low_arg as usize..(low_arg + run_length) as usize].reverse(); }
        Some(run_length)
    }

    fn binary_insertion_sort(&mut self, low: i64, start_arg: i64, high: i64) -> Option<()> {
        let mut start = if low == start_arg { start_arg + 1 } else { start_arg };
        while start < high {
            let mut left = low;
            let mut right = start;
            let pivot = self.a[start as usize];
            while left < right {
                let mid = left + ((right - left) >> 1);
                let m = self.a[mid as usize];
                let order = self.c(pivot, m)?;
                if order < 0.0 { right = mid; } else { left = mid + 1; }
            }
            let mut p = start;
            while p > left { self.a[p as usize] = self.a[(p - 1) as usize]; p -= 1; }
            self.a[left as usize] = pivot;
            start += 1;
        }
        Some(())
    }

    fn inv(&self, n: i64) -> bool {
        if n < 2 { return true; }
        let l = &self.len;
        l[(n - 2) as usize] > l[(n - 1) as usize] + l[n as usize]
    }

    fn merge_collapse(&mut self) -> Option<()> {
        while self.len.len() > 1 {
            let mut n = self.len.len() as i64 - 2;
            if !self.inv(n + 1) || !self.inv(n) {
                if self.len[(n - 1) as usize] < self.len[(n + 1) as usize] { n -= 1; }
                self.merge_at(n)?;
            } else if self.len[n as usize] <= self.len[(n + 1) as usize] {
                self.merge_at(n)?;
            } else { break; }
        }
        Some(())
    }

    fn merge_force_collapse(&mut self) -> Option<()> {
        while self.len.len() > 1 {
            let mut n = self.len.len() as i64 - 2;
            if n > 0 && self.len[(n - 1) as usize] < self.len[(n + 1) as usize] { n -= 1; }
            self.merge_at(n)?;
        }
        Some(())
    }

    fn merge_at(&mut self, i: i64) -> Option<()> {
        let iu = i as usize;
        let stack_size = self.len.len() as i64;
        let mut base_a = self.base[iu];
        let mut length_a = self.len[iu];
        let base_b = self.base[iu + 1];
        let mut length_b = self.len[iu + 1];
        self.len[iu] = length_a + length_b;
        if i == stack_size - 3 {
            self.base[iu + 1] = self.base[iu + 2];
            self.len[iu + 1] = self.len[iu + 2];
        }
        self.base.pop();
        self.len.pop();
        let key_right = self.a[base_b as usize];
        let k = self.gallop_right(None, key_right, base_a, length_a, 0)?;
        base_a += k;
        length_a -= k;
        if length_a == 0 { return Some(()); }
        let key_left = self.a[(base_a + length_a - 1) as usize];
        length_b = self.gallop_left(None, key_left, base_b, length_b, length_b - 1)?;
        if length_b == 0 { return Some(()); }
        if length_a <= length_b { self.merge_low(base_a, length_a, base_b, length_b) } else { self.merge_high(base_a, length_a, base_b, length_b) }
    }

    fn el(&self, arr: Option<&Vec<W>>, i: i64) -> W {
        match arr { Some(t) => t[i as usize], None => self.a[i as usize] }
    }

    fn gallop_left(&mut self, arr: Option<&Vec<W>>, key: W, base: i64, length: i64, hint: i64) -> Option<i64> {
        let mut last_ofs: i64 = 0;
        let mut offset: i64 = 1;
        let base_hint = self.el(arr, base + hint);
        let order = self.c(base_hint, key)?;
        if order < 0.0 {
            let max_ofs = length - hint;
            while offset < max_ofs {
                let e = self.el(arr, base + hint + offset);
                let order = self.c(e, key)?;
                if order >= 0.0 { break; }
                last_ofs = offset;
                offset = (offset << 1) + 1;
                if offset <= 0 { offset = max_ofs; }
            }
            if offset > max_ofs { offset = max_ofs; }
            last_ofs += hint;
            offset += hint;
        } else {
            let max_ofs = hint + 1;
            while offset < max_ofs {
                let e = self.el(arr, base + hint - offset);
                let order = self.c(e, key)?;
                if order < 0.0 { break; }
                last_ofs = offset;
                offset = (offset << 1) + 1;
                if offset <= 0 { offset = max_ofs; }
            }
            if offset > max_ofs { offset = max_ofs; }
            let tmp = last_ofs;
            last_ofs = hint - offset;
            offset = hint - tmp;
        }
        last_ofs += 1;
        while last_ofs < offset {
            let m = last_ofs + ((offset - last_ofs) >> 1);
            let e = self.el(arr, base + m);
            let order = self.c(e, key)?;
            if order < 0.0 { last_ofs = m + 1; } else { offset = m; }
        }
        Some(offset)
    }

    fn gallop_right(&mut self, arr: Option<&Vec<W>>, key: W, base: i64, length: i64, hint: i64) -> Option<i64> {
        let mut last_ofs: i64 = 0;
        let mut offset: i64 = 1;
        let base_hint = self.el(arr, base + hint);
        let order = self.c(key, base_hint)?;
        if order < 0.0 {
            let max_ofs = hint + 1;
            while offset < max_ofs {
                let e = self.el(arr, base + hint - offset);
                let order = self.c(key, e)?;
                if order >= 0.0 { break; }
                last_ofs = offset;
                offset = (offset << 1) + 1;
                if offset <= 0 { offset = max_ofs; }
            }
            if offset > max_ofs { offset = max_ofs; }
            let tmp = last_ofs;
            last_ofs = hint - offset;
            offset = hint - tmp;
        } else {
            let max_ofs = length - hint;
            while offset < max_ofs {
                let e = self.el(arr, base + hint + offset);
                let order = self.c(key, e)?;
                if order < 0.0 { break; }
                last_ofs = offset;
                offset = (offset << 1) + 1;
                if offset <= 0 { offset = max_ofs; }
            }
            if offset > max_ofs { offset = max_ofs; }
            last_ofs += hint;
            offset += hint;
        }
        last_ofs += 1;
        while last_ofs < offset {
            let m = last_ofs + ((offset - last_ofs) >> 1);
            let e = self.el(arr, base + m);
            let order = self.c(key, e)?;
            if order < 0.0 { offset = m; } else { last_ofs = m + 1; }
        }
        Some(offset)
    }

    fn merge_low(&mut self, base_a: i64, length_a_arg: i64, base_b: i64, length_b_arg: i64) -> Option<()> {
        let mut length_a = length_a_arg;
        let mut length_b = length_b_arg;
        let temp: Vec<W> = self.a[base_a as usize..(base_a + length_a) as usize].to_vec();
        let mut dest = base_a;
        let mut cursor_temp: i64 = 0;
        let mut cursor_b = base_b;
        self.a[dest as usize] = self.a[cursor_b as usize];
        dest += 1;
        cursor_b += 1;
        // 0 = Succeed, 1 = CopyB
        let ausgang: u8 = 'haupt: {
            length_b -= 1;
            if length_b == 0 { break 'haupt 0; }
            if length_a == 1 { break 'haupt 1; }
            let mut min_gallop = self.min_gallop;
            loop {
                let mut wins_a: i64 = 0;
                let mut wins_b: i64 = 0;
                loop {
                    let x = self.a[cursor_b as usize];
                    let y = temp[cursor_temp as usize];
                    let order = self.c(x, y)?;
                    if order < 0.0 {
                        self.a[dest as usize] = self.a[cursor_b as usize];
                        dest += 1; cursor_b += 1;
                        wins_b += 1; length_b -= 1; wins_a = 0;
                        if length_b == 0 { break 'haupt 0; }
                        if wins_b >= min_gallop { break; }
                    } else {
                        self.a[dest as usize] = temp[cursor_temp as usize];
                        dest += 1; cursor_temp += 1;
                        wins_a += 1; length_a -= 1; wins_b = 0;
                        if length_a == 1 { break 'haupt 1; }
                        if wins_a >= min_gallop { break; }
                    }
                }
                min_gallop += 1;
                let mut first = true;
                while wins_a >= MIN_GALLOP || wins_b >= MIN_GALLOP || first {
                    first = false;
                    min_gallop = if min_gallop - 1 > 1 { min_gallop - 1 } else { 1 };
                    self.min_gallop = min_gallop;
                    let key = self.a[cursor_b as usize];
                    wins_a = self.gallop_right(Some(&temp), key, cursor_temp, length_a, 0)?;
                    if wins_a > 0 {
                        for i in 0..wins_a { self.a[(dest + i) as usize] = temp[(cursor_temp + i) as usize]; }
                        dest += wins_a; cursor_temp += wins_a; length_a -= wins_a;
                        if length_a == 1 { break 'haupt 1; }
                        if length_a == 0 { break 'haupt 0; }
                    }
                    self.a[dest as usize] = self.a[cursor_b as usize];
                    dest += 1; cursor_b += 1;
                    length_b -= 1;
                    if length_b == 0 { break 'haupt 0; }
                    let key = temp[cursor_temp as usize];
                    wins_b = self.gallop_left(None, key, cursor_b, length_b, 0)?;
                    if wins_b > 0 {
                        for i in 0..wins_b { self.a[(dest + i) as usize] = self.a[(cursor_b + i) as usize]; }
                        dest += wins_b; cursor_b += wins_b; length_b -= wins_b;
                        if length_b == 0 { break 'haupt 0; }
                    }
                    self.a[dest as usize] = temp[cursor_temp as usize];
                    dest += 1; cursor_temp += 1;
                    length_a -= 1;
                    if length_a == 1 { break 'haupt 1; }
                }
                min_gallop += 1;
                self.min_gallop = min_gallop;
            }
        };
        if ausgang == 0 {
            if length_a > 0 { for i in 0..length_a { self.a[(dest + i) as usize] = temp[(cursor_temp + i) as usize]; } }
        } else {
            for i in 0..length_b { self.a[(dest + i) as usize] = self.a[(cursor_b + i) as usize]; }
            self.a[(dest + length_b) as usize] = temp[cursor_temp as usize];
        }
        Some(())
    }

    fn merge_high(&mut self, base_a: i64, length_a_arg: i64, base_b: i64, length_b_arg: i64) -> Option<()> {
        let mut length_a = length_a_arg;
        let mut length_b = length_b_arg;
        let temp: Vec<W> = self.a[base_b as usize..(base_b + length_b) as usize].to_vec();
        let mut dest = base_b + length_b - 1;
        let mut cursor_temp = length_b - 1;
        let mut cursor_a = base_a + length_a - 1;
        self.a[dest as usize] = self.a[cursor_a as usize];
        dest -= 1; cursor_a -= 1;
        // 0 = Succeed, 1 = CopyA
        let ausgang: u8 = 'haupt: {
            length_a -= 1;
            if length_a == 0 { break 'haupt 0; }
            if length_b == 1 { break 'haupt 1; }
            let mut min_gallop = self.min_gallop;
            loop {
                let mut wins_a: i64 = 0;
                let mut wins_b: i64 = 0;
                loop {
                    let x = temp[cursor_temp as usize];
                    let y = self.a[cursor_a as usize];
                    let order = self.c(x, y)?;
                    if order < 0.0 {
                        self.a[dest as usize] = self.a[cursor_a as usize];
                        dest -= 1; cursor_a -= 1;
                        wins_a += 1; length_a -= 1; wins_b = 0;
                        if length_a == 0 { break 'haupt 0; }
                        if wins_a >= min_gallop { break; }
                    } else {
                        self.a[dest as usize] = temp[cursor_temp as usize];
                        dest -= 1; cursor_temp -= 1;
                        wins_b += 1; length_b -= 1; wins_a = 0;
                        if length_b == 1 { break 'haupt 1; }
                        if wins_b >= min_gallop { break; }
                    }
                }
                min_gallop += 1;
                let mut first = true;
                while wins_a >= MIN_GALLOP || wins_b >= MIN_GALLOP || first {
                    first = false;
                    min_gallop = if min_gallop - 1 > 1 { min_gallop - 1 } else { 1 };
                    self.min_gallop = min_gallop;
                    let key = temp[cursor_temp as usize];
                    let k = self.gallop_right(None, key, base_a, length_a, length_a - 1)?;
                    wins_a = length_a - k;
                    if wins_a > 0 {
                        dest -= wins_a; cursor_a -= wins_a;
                        let mut i = wins_a - 1;
                        while i >= 0 { self.a[(dest + 1 + i) as usize] = self.a[(cursor_a + 1 + i) as usize]; i -= 1; }
                        length_a -= wins_a;
                        if length_a == 0 { break 'haupt 0; }
                    }
                    self.a[dest as usize] = temp[cursor_temp as usize];
                    dest -= 1; cursor_temp -= 1;
                    length_b -= 1;
                    if length_b == 1 { break 'haupt 1; }
                    let key = self.a[cursor_a as usize];
                    let k = self.gallop_left(Some(&temp), key, 0, length_b, length_b - 1)?;
                    wins_b = length_b - k;
                    if wins_b > 0 {
                        dest -= wins_b; cursor_temp -= wins_b;
                        for i in 0..wins_b { self.a[(dest + 1 + i) as usize] = temp[(cursor_temp + 1 + i) as usize]; }
                        length_b -= wins_b;
                        if length_b == 1 { break 'haupt 1; }
                        if length_b == 0 { break 'haupt 0; }
                    }
                    self.a[dest as usize] = self.a[cursor_a as usize];
                    dest -= 1; cursor_a -= 1;
                    length_a -= 1;
                    if length_a == 0 { break 'haupt 0; }
                }
                min_gallop += 1;
                self.min_gallop = min_gallop;
            }
        };
        if ausgang == 0 {
            if length_b > 0 { for i in 0..length_b { self.a[(dest - (length_b - 1) + i) as usize] = temp[i as usize]; } }
        } else {
            dest -= length_a; cursor_a -= length_a;
            let mut i = length_a - 1;
            while i >= 0 { self.a[(dest + 1 + i) as usize] = self.a[(cursor_a + 1 + i) as usize]; i -= 1; }
            self.a[dest as usize] = temp[cursor_temp as usize];
        }
        Some(())
    }
}
