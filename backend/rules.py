"""偏航对中判定。

判定带按绝对值划分：
- |x| <= inner（合格内界，默认 1.5°）：合格（绿）
- inner < |x| <= outer（琥珀外界，默认 1.8°）：合格但「近阈」（琥珀），
  仍可入队，只有超出琥珀外界才算超差
- |x| > outer：偏航超差（红）

内/外界可在运行中调整（见 band_configs 表）。worker 认领单据的瞬间会
快照当时的内/外界，单据此后始终按领单时的界着色，改带只影响之后新认领
的单据。判定函数因此显式接收 inner/outer，不读全局配置。
"""

DEFAULT_INNER_DEG = 1.5
DEFAULT_OUTER_DEG = 1.8

VERDICT_OK = "合格"
VERDICT_BAD = "偏航超差"


def validate_band(inner_deg: float, outer_deg: float):
    """校验琥珀带参数，非法时抛 ValueError。返回 (inner, outer) 浮点值。"""
    try:
        inner = float(inner_deg)
        outer = float(outer_deg)
    except (TypeError, ValueError):
        raise ValueError("内界与外界必须是数字")
    if inner <= 0 or outer <= 0:
        raise ValueError("内界与外界必须为正数")
    if outer <= inner:
        raise ValueError("琥珀外界必须严格大于合格内界")
    return inner, outer


def judge(
    yaw_err_deg: float,
    inner_deg: float = DEFAULT_INNER_DEG,
    outer_deg: float = DEFAULT_OUTER_DEG,
) -> tuple[str, bool, str]:
    """按给定内/外界判定。

    返回 (verdict, near_threshold, reason)：
    - 合格带内：("合格", False, ...)
    - 琥珀近阈带内（仍算合格）：("合格", True, ...)
    - 超出琥珀外界：("偏航超差", False, ...)
    """
    a = abs(float(yaw_err_deg))
    if a <= inner_deg:
        return (
            VERDICT_OK,
            False,
            f"偏航误差 {yaw_err_deg}° 在 ±{inner_deg}° 合格带内",
        )
    if a <= outer_deg:
        return (
            VERDICT_OK,
            True,
            f"偏航误差 {yaw_err_deg}° 落入近阈琥珀带（±{inner_deg}°～±{outer_deg}°），"
            f"仍属合格但已接近阈值",
        )
    return (
        VERDICT_BAD,
        False,
        f"偏航误差 {yaw_err_deg}° 超出琥珀外界 ±{outer_deg}°，判定超差",
    )
