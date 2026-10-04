"""偏航对中判定：合格带 ±inner，近阈琥珀带 (inner, outer]，超出外界才算偏航超差。"""

DEFAULT_INNER_DEG = 1.5
DEFAULT_OUTER_DEG = 1.8

VERDICT_PASS = "合格"
VERDICT_NEAR = "近阈"
VERDICT_FAIL = "偏航超差"


def judge(
    yaw_err_deg: float,
    inner_deg: float = DEFAULT_INNER_DEG,
    outer_deg: float = DEFAULT_OUTER_DEG,
) -> tuple[str, str]:
    """按 (inner, outer] 琥珀带判定；reason 携带本次所用界限，保证与着色同一套界。"""
    err = abs(yaw_err_deg)
    if err <= inner_deg:
        return (
            VERDICT_PASS,
            f"偏航误差 {yaw_err_deg}° 在 ±{inner_deg}° 合格带以内",
        )
    if err <= outer_deg:
        return (
            VERDICT_NEAR,
            f"偏航误差 {yaw_err_deg}° 落入近阈琥珀带 ({inner_deg}°, {outer_deg}°]，"
            f"仍可入队，超出 ±{outer_deg}° 才算超差",
        )
    return (
        VERDICT_FAIL,
        f"偏航误差 {yaw_err_deg}° 超出近阈琥珀带外界 ±{outer_deg}°",
    )
