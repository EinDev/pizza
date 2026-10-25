//! Zahlen als Text genau wie JavaScript `String(x)` (kürzeste Darstellung, die zurück zur selben Zahl führt), damit
//! Fehlertexte des Kerns in allen Motoren gleich lauten (`nicht 2.5`, `nicht 1e+21`, `nicht -0.000001`).

use alloc::format;
use alloc::string::String;

/// `String(x)` aus JavaScript.
pub fn zahl_text(x: f64) -> String {
    if x.is_nan() {
        return String::from("NaN");
    }
    if x.is_infinite() {
        return String::from(if x > 0.0 { "Infinity" } else { "-Infinity" });
    }
    if x == 0.0 {
        return String::from("0");
    }
    // `{:e}` liefert die kürzesten Ziffern (Grisu/Dragon), z. B. "1.2345e-7", "1e21", "5e0".
    let e = format!("{:e}", if x < 0.0 { -x } else { x });
    let (mant, exp) = e.split_once('e').unwrap_or((e.as_str(), "0"));
    let exp: i32 = exp.parse().unwrap_or(0);
    let ziffern: String = mant.chars().filter(|c| *c != '.').collect();
    let k = ziffern.len() as i32;
    let n = exp + 1;
    let mut s = String::new();
    if x < 0.0 {
        s.push('-');
    }
    if k <= n && n <= 21 {
        s.push_str(&ziffern);
        for _ in 0..(n - k) {
            s.push('0');
        }
    } else if 0 < n && n <= 21 {
        s.push_str(&ziffern[..n as usize]);
        s.push('.');
        s.push_str(&ziffern[n as usize..]);
    } else if -6 < n && n <= 0 {
        s.push_str("0.");
        for _ in 0..(-n) {
            s.push('0');
        }
        s.push_str(&ziffern);
    } else {
        s.push_str(&ziffern[..1]);
        if k > 1 {
            s.push('.');
            s.push_str(&ziffern[1..]);
        }
        s.push('e');
        s.push(if n - 1 >= 0 { '+' } else { '-' });
        s.push_str(&format!("{}", (n - 1).abs()));
    }
    s
}

#[cfg(test)]
mod tests {
    use super::zahl_text;

    #[test]
    fn wie_javascript() {
        let faelle: &[(f64, &str)] = &[
            (0.0, "0"),
            (-0.0, "0"),
            (1.0, "1"),
            (-1.0, "-1"),
            (2.5, "2.5"),
            (0.1, "0.1"),
            (0.1 + 0.2, "0.30000000000000004"),
            (1e21, "1e+21"),
            (1e20, "100000000000000000000"),
            (123456789012345680000.0, "123456789012345680000"),
            (1e-7, "1e-7"),
            (1.5e-7, "1.5e-7"),
            (0.000001, "0.000001"),
            (-0.0000015, "-0.0000015"),
            (4096.0, "4096"),
            (1.7976931348623157e308, "1.7976931348623157e+308"),
            (5e-324, "5e-324"),
            (f64::NAN, "NaN"),
            (f64::INFINITY, "Infinity"),
            (f64::NEG_INFINITY, "-Infinity"),
            (100.0, "100"),
            (12.75, "12.75"),
            (1e100, "1e+100"),
        ];
        for (x, t) in faelle {
            assert_eq!(zahl_text(*x), *t, "für {:?}", x);
        }
    }
}
