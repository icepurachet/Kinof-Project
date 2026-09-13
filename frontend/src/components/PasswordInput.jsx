import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function PasswordInput({
  value,
  onChange,
  className = "",
  icon: Icon,
  iconClassName = "absolute left-3 top-1/2 -translate-y-1/2 text-gray-400",
  ...props
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      {Icon ? <Icon size={15} className={iconClassName} /> : null}
      <input
        {...props}
        value={value}
        onChange={onChange}
        type={visible ? "text" : "password"}
        className={className}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        aria-label={visible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
      >
        {visible ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}
