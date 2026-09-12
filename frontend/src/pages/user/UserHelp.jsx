import React, { useEffect, useState, useRef } from "react";
import { Camera, Image as ImageIcon, X, Plus, Eye, Calendar, FileText, Send, HelpCircle } from "lucide-react";
import Card from "../../components/Card";
import Pill from "../../components/Pill";
import Button from "../../components/Button";
import { createProblemReport, loadProblemImage } from "../../api/problemReports";

export default function UserHelp({ problemReports = [], onSubmitted, notify }) {
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState([]);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [loadedImages, setLoadedImages] = useState({});

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  useEffect(() => {
    let active = true;
    const attachments = problemReports.flatMap((report) => report.images ?? []);
    Promise.all(attachments.map(async (image) => [image.id, await loadProblemImage(image.url)]))
      .then((entries) => active && setLoadedImages(Object.fromEntries(entries)))
      .catch(() => {});
    return () => {
      active = false;
      Object.values(loadedImages).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [problemReports]);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    const availableSlots = 3 - images.length;
    const filesToProcess = files.slice(0, availableSlots);

    const validFiles = filesToProcess.filter((file) => file.type.startsWith("image/") && file.size <= 5 * 1024 * 1024);
    setImages((prev) => [
      ...prev,
      ...validFiles.map((file) => ({ file, preview: URL.createObjectURL(file) })),
    ].slice(0, 3));

    e.target.value = "";
    setShowSourceModal(false);
  };

  const handleRemoveImage = (indexToRemove) => {
    setImages((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleSubmit = async () => {
    const trimmedCategory = category.trim();
    const trimmedDescription = description.trim();
    if (!trimmedCategory || !trimmedDescription) return;

    try {
      const report = await createProblemReport({
        category: trimmedCategory,
        description: trimmedDescription,
        files: images.map((image) => image.file),
      });
      onSubmitted?.(report);
      notify?.("ส่งคำร้องขอความช่วยเหลือเรียบร้อยแล้ว");
      setCategory("");
      setDescription("");
      images.forEach((image) => URL.revokeObjectURL(image.preview));
      setImages([]);
    } catch (error) {
      notify?.(error.message);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-ink tracking-tight">ศูนย์ช่วยเหลือและแจ้งปัญหา</h1>
        <p className="text-caption mt-0.5">แจ้งปัญหาการใช้งานห้องแล็บ อุปกรณ์ หรือข้อสงสัยอื่นๆ</p>
      </div>

      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" multiple className="hidden" />
      <input type="file" ref={cameraInputRef} onChange={handleFileChange} accept="image/*" capture="environment" className="hidden" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* แบบฟอร์มแจ้งปัญหา */}
        <Card className="p-5 md:p-6">
          <div className="rounded-2xl text-white p-4 mb-5 text-xs font-light leading-relaxed shadow-blue-glow border border-navy-700/30 bg-brand-gradient">
            พบปัญหาการใช้งานคอมพิวเตอร์หรือระบบจอง? กรอกข้อมูลด้านล่างเพื่อส่งเรื่องให้เจ้าหน้าที่ตรวจสอบ
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                หัวข้อปัญหา <span className="text-rose-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-xl px-3.5 py-3 focus:outline-none focus:border-navy-800 focus:ring-2 focus:ring-navy-800/10 bg-white"
              >
                <option value="">-- เลือกหัวข้อปัญหา --</option>
                <option value="ปัญหาการจองห้องแล็บ">ปัญหาการจองห้องแล็บ</option>
                <option value="ปัญหาโปรไฟล์/บัญชี">ปัญหาโปรไฟล์/บัญชี</option>
                <option value="ปัญหาเครื่องคอมพิวเตอร์">ปัญหาเครื่องคอมพิวเตอร์</option>
                <option value="อื่น ๆ">อื่น ๆ</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                รายละเอียดปัญหา <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="ระบุรายละเอียด เช่น หมายเลขเครื่อง อาการ หรือภาพประกอบเพื่อความสะดวกรวดเร็ว..."
                className="w-full text-xs border border-slate-200 rounded-xl p-3.5 focus:outline-none focus:border-navy-800 focus:ring-2 focus:ring-navy-800/10 resize-none placeholder:text-slate-300"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-700">แนบรูปภาพเพิ่มเติม</label>
                <span className="text-caption">สูงสุด 3 รูป</span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map((index) => {
                  const imgUrl = images[index];
                  return (
                    <div key={index} className="aspect-square relative">
                      {imgUrl ? (
                        <div className="w-full h-full rounded-2xl border border-slate-200 overflow-hidden relative group shadow-sm">
                          <img src={imgUrl.preview} alt={`attached-${index}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(index)}
                            aria-label="ลบรูปนี้"
                            className="absolute top-1.5 right-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => images.length < 3 && setShowSourceModal(true)}
                          disabled={images.length >= 3}
                          className="w-full h-full border border-slate-200/80 rounded-2xl flex flex-col items-center justify-center gap-1 bg-slate-50/60 hover:bg-slate-100 hover:border-slate-300 transition-all text-slate-400 hover:text-slate-600 disabled:opacity-40"
                        >
                          <Plus size={20} />
                          <span className="text-[10px] font-medium">เพิ่มรูป</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <Button
              variant="primary"
              size="lg"
              icon={Send}
              iconPosition="left"
              fullWidth
              disabled={!category.trim() || !description.trim()}
              onClick={handleSubmit}
            >
              ส่งคำร้องขอความช่วยเหลือ
            </Button>
          </div>
        </Card>

        {/* ประวัติการส่งคำร้อง */}
        <Card className="p-5 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <HelpCircle size={17} className="text-slate-500" />
              <h3 className="text-sm md:text-base font-bold text-ink">ประวัติการส่งคำร้องของคุณ</h3>
            </div>
            <span className="text-caption">
              {problemReports.length} คำร้อง
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {problemReports.map((report) => (
                <div
                  key={report.id}
                  onClick={() => setSelectedReport(report)}
                  className="group flex flex-col border border-slate-200/80 rounded-2xl p-4 text-xs gap-2.5 bg-white hover:border-slate-300 hover:shadow-soft transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-ink font-bold group-hover:text-navy-800 transition-colors truncate pr-2">
                      {report.category}
                    </span>
                    <Pill
                      tone={
                        report.status === "เสร็จสิ้น"
                          ? "green"
                          : report.status === "กำลังดำเนินการ"
                          ? "blue"
                          : "amber"
                      }
                      withDot
                    >
                      {report.status}
                    </Pill>
                  </div>

                  <p className="text-slate-500 text-[11px] line-clamp-2 leading-relaxed font-light">
                    {report.description}
                  </p>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      {report.images && report.images.length > 0 && (
                        <div className="flex gap-1">
                          {report.images.map((img, i) => (
                            <img key={i} src={loadedImages[img.id]} alt="attachment" className="w-6 h-6 rounded-md object-cover border border-slate-200" />
                          ))}
                        </div>
                      )}
                      <span className="text-[10px] text-muted flex items-center gap-1">
                        <Calendar size={11} /> {report.createdAt}
                      </span>
                    </div>

                    <span className="text-[11px] text-navy-800 font-medium flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <Eye size={12} /> ดูรายละเอียด
                    </span>
                  </div>
                </div>
              ))}

            {problemReports.length === 0 && (
              <div className="text-xs text-muted text-center py-16 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                ยังไม่มีประวัติการส่งคำร้อง
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Modal รายละเอียดคำร้อง */}
      {selectedReport && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col animate-scale-in">
            <div className="p-5 text-white flex items-center justify-between shrink-0 bg-brand-gradient">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-gold-400" />
                <h3 className="text-sm font-bold">รายละเอียดคำร้องขอความช่วยเหลือ</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                aria-label="ปิดหน้าต่าง"
                className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4 overflow-y-auto">
              <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                <div>
                  <span className="text-[10px] text-muted font-semibold uppercase tracking-wider block mb-0.5">หัวข้อ</span>
                  <h4 className="text-base font-bold text-ink">{selectedReport.category}</h4>
                </div>
                <Pill
                  tone={
                    selectedReport.status === "เสร็จสิ้น"
                      ? "green"
                      : selectedReport.status === "กำลังดำเนินการ"
                      ? "blue"
                      : "amber"
                  }
                  withDot
                >
                  {selectedReport.status}
                </Pill>
              </div>

              <div>
                <span className="text-[10px] text-muted font-semibold uppercase tracking-wider block mb-1">รายละเอียด</span>
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                  {selectedReport.description}
                </div>
              </div>

              {selectedReport.images && selectedReport.images.length > 0 && (
                <div>
                  <span className="text-[10px] text-muted font-semibold uppercase tracking-wider block mb-2">
                    รูปภาพแนบ ({selectedReport.images.length} รูป)
                  </span>
                  <div className="grid grid-cols-3 gap-3">
                    {selectedReport.images.map((img, index) => (
                      <div
                        key={index}
                        onClick={() => setPreviewImage(loadedImages[img.id])}
                        className="aspect-square rounded-2xl overflow-hidden border border-slate-200 cursor-pointer group relative shadow-sm"
                      >
                        <img src={loadedImages[img.id]} alt={`large-${index}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-medium gap-1">
                          <Eye size={14} /> ขยาย
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
              <Button variant="secondary" onClick={() => setSelectedReport(null)}>
                ปิดหน้าต่าง
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Preview รูปภาพเดี่ยว */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black/85 z-[60] flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh]">
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              aria-label="ปิดรูปภาพ"
              className="absolute -top-10 right-0 text-white"
            >
              <X size={24} />
            </button>
            <img src={previewImage} alt="preview" className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl" />
          </div>
        </div>
      )}

      {/* Modal ตัวเลือกที่มาของรูป */}
      {showSourceModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-2xl animate-scale-in">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">เลือกวิธีแนบรูปภาพ</h3>
              <button
                type="button"
                onClick={() => setShowSourceModal(false)}
                aria-label="ปิดหน้าต่าง"
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex items-center gap-3 w-full p-3.5 text-xs text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-xl bg-navy-50 text-navy-800 flex items-center justify-center shrink-0">
                  <Camera size={18} />
                </div>
                <div>
                  <div className="font-semibold text-slate-800">ถ่ายรูป</div>
                  <div className="text-[10px] text-muted">เปิดกล้องถ่ายภาพใหม่</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-3 w-full p-3.5 text-xs text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-xl bg-gold-50 text-gold-600 flex items-center justify-center shrink-0">
                  <ImageIcon size={18} />
                </div>
                <div>
                  <div className="font-semibold text-slate-800">เลือกจากคลังภาพ / ไฟล์</div>
                  <div className="text-[10px] text-muted">เลือกภาพที่มีในอุปกรณ์</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}