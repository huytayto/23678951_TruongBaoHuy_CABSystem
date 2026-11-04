const fs = require('node:fs');
const path = require('node:path');
const { passwords, admin, drivers, latitude, longitude } = require('../services/smoke-fixtures');
const output = path.resolve(__dirname, '../postman/smoke-20p');
fs.mkdirSync(output, { recursive: true });
const steps = [];
// Postman native API only. Every supporting HTTP call uses the same Gateway.
const helpers = `
const v=k=>pm.collectionVariables.get(k), save=(k,x)=>pm.collectionVariables.set(k,x);
const api=(method,url,token,body,status=200)=>new Promise((resolve,reject)=>pm.sendRequest({method,url:pm.environment.get('base_url')+url,header:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:{mode:'raw',raw:JSON.stringify(body)}}:{})},(e,r)=>e?reject(e):r.code!==status?reject(new Error(method+' '+url+': HTTP '+r.code)):resolve(r.json())));
const verify=(name,ok)=>pm.test(name,()=>pm.expect(Boolean(ok)).to.eql(true));
async function inbox(token,type,id){for(let i=0;i<30;i++){const r=await api('GET','/api/notifications/me?limit=200',token);if(r.notifications.some(n=>n.payload.event_type===type && n.payload.aggregate_id===id))return true;await new Promise(r=>setTimeout(r,150));}throw new Error('Không nhận '+type);}
`;
function script(code) {
  return ['(async()=>{', helpers, code, "})().catch(e=>pm.test('Các bước API phụ thành công',()=>{throw e;}));"];
}
function add(n, title, method, url, token, body, status, check, after, before, seconds, what, expected, say) {
  const request = { method, url:'{{base_url}}'+url, header:[],
    auth:token?{type:'bearer',bearer:[{key:'token',value:`{{${token}}}`,type:'string'}]}:{type:'noauth'},
    description:`Tiêu chí: ${title}\nLàm gì: ${what}\nKết quả mong đợi: ${expected}\nNói với giảng viên: ${say}   (~${seconds}s)` };
  if(body!==undefined){request.header.push({key:'Content-Type',value:'application/json'});request.body={mode:'raw',raw:JSON.stringify(body),options:{raw:{language:'json'}}};}
  const event=[];
  if(before)event.push({listen:'prerequest',script:{type:'text/javascript',exec:script(before)}});
  event.push({listen:'test',script:{type:'text/javascript',exec:script(`const d=pm.response.json(); pm.test('HTTP ${status}',()=>pm.expect(pm.response.code).to.eql(${status}));\n${check?`verify('Kết quả',${check});`:''}\n${after||''}`)}});
  const item={name:`${String(n).padStart(2,'0')} - ${title}`,request,event};
  steps.push({n,seconds,item});return item;
}
const booking={from_lat:latitude,from_lng:longitude,to_lat:latitude+0.01,to_lng:longitude+0.01};
add(6,'API health check','GET','/api/services',null,undefined,200,'d.status === "UP"',`
await api('GET','/api/health'); await api('GET','/api/ready');
const a=await api('POST','/api/login',null,{user:${JSON.stringify(admin.username)},pass:${JSON.stringify(passwords.ADMIN)}});
const r=await api('POST','/api/login',null,{user:${JSON.stringify(drivers[0].username)},pass:${JSON.stringify(passwords.DRIVER)}});
save('admin_token',a.token);save('driver_token',r.token);save('driver_id',r.uid);
const driver=await api('GET','/api/drivers/me',r.token);save('driver_id',driver.driver.uid);
`,null,25,'Send kiểm tra health; Tests kiểm tra /health, /ready và đăng nhập hai tài khoản seed.','Đủ service UP; token được lưu tự động.','Seed được nạp trước giờ chấm, không đổi API health thành API chuẩn bị dữ liệu.');
add(9,'Đăng ký tài khoản khách hàng','POST','/api/register',null,{user:'kh5',fullname:'An',pass:passwords.CUSTOMER,role:'CUSTOMER'},201,'d.role === "CUSTOMER"',"save('customer_id',d.uid);save('username',d.username);",null,25,'Send tạo customer mới qua API đăng ký.','Tạo tài khoản, chuẩn bị đăng nhập cùng tài khoản ở bước 10.','Đây là endpoint đăng ký nghiệp vụ thật.');
add(10,'Đăng nhập khách hàng','POST','/api/login',null,{user:'{{username}}',pass:passwords.CUSTOMER},200,'d.role === "CUSTOMER" && !!d.token',`
save('token',d.token);
const profile=await api('GET','/api/customers/me',d.token);save('customer_id',profile.customer.uid);
for(let i=0;i<5;i++){const b=await api('POST','/api/bookings',d.token,${JSON.stringify(booking)},201);await api('POST','/api/bookings/'+b.booking.booking_id+'/cancel',d.token,{reason:'Mau'});}
`,null,30,'Send đăng nhập; Tests tự chuẩn bị 5 booking mẫu qua API tạo/hủy.','Có JWT đúng customer, 5 booking để kiểm tra phân trang.','Không đổi API login; các thao tác chuẩn bị chạy bằng pm.sendRequest.');
add(11,'Lấy thông tin khách hàng với mã số','GET','/api/customers/{{customer_id}}','token',undefined,200,'d.customer.uid === v("customer_id")',null,null,15,'Send xem hồ sơ customer đã đăng nhập.','Trả đúng mã customer.','Quyền sở hữu vẫn kiểm tra bằng JWT.');
add(12,'Lấy thông tin tài xế với mã số','GET','/api/drivers/{{driver_id}}','admin_token',undefined,200,'d.driver.approval_status === "ACTIVE"',null,null,15,'Send bằng token Admin có sẵn.','Đúng hồ sơ tài xế đã duyệt.','Không copy token hoặc mã tài xế bằng tay.');
add(13,'Liệt kê danh sách tài xế tại khu vực','GET','/api/drivers/nearby?lat=22&lng=111&radius=1km&limit=5&page=1','admin_token',undefined,200,'d.drivers.length === 5 && d.pagination.total === 5 && d.drivers.every(x=>x.distance_meters<=1000)',`
const p1=await api('GET','/api/drivers/nearby?lat=22&lng=111&radius=1km&limit=2&page=1',v('admin_token'));
const p2=await api('GET','/api/drivers/nearby?lat=22&lng=111&radius=1km&limit=2&page=2',v('admin_token'));
verify('Paging',p1.drivers.length===2 && p2.drivers.length===2 && p2.drivers.every(b=>!p1.drivers.some(a=>a.uid===b.uid)));
verify('Mixed states',new Set(d.drivers.map(x=>x.approval_status)).size>=3 && new Set(d.drivers.map(x=>x.availability)).size>=2);
`,null,25,'Send xem đủ 5 driver; Tests kiểm tra thêm phân trang limit 2.','Đủ 5 tài xế khác trạng thái trong 1km quanh lat=22,lng=111.','Danh sách gồm vị trí cuối của tài xế; ghép chuyến chỉ chọn ACTIVE/AVAILABLE qua Redis Geo.');
add(14,'Liệt kê danh sách các booking của Customer','GET','/api/bookings?limit=2&page=1','token',undefined,200,'d.bookings.length === 2',`
const p=await api('GET','/api/bookings?limit=2&page=2',v('token'));
verify('Phân trang đúng customer',p.bookings.length===2 && p.bookings.every(b=>b.customer_id===v('customer_id') && !d.bookings.some(a=>a.booking_id===b.booking_id)));
`,null,25,'Send trang 1; Tests lấy trang 2 qua API list booking.','Có ít nhất 5 booking, limit và paging không lặp.','Các bản ghi mẫu được tạo bằng API ở bước 10.');
add(15,'Đặt xe','POST','/api/bookings','token',booking,201,'d.booking.status === "SEARCHING_DRIVER"',"save('booking_id',d.booking.booking_id);",null,30,'Send tạo booking mới, tự lưu booking_id.','SEARCHING_DRIVER và gửi offer.','Điểm đón cố định; offer local 10 phút để đủ thao tác.');
add(16,'Tài xế nhận chuyến','POST','/api/bookings/{{booking_id}}/accept','driver_token',undefined,200,'d.trip.status === "DRIVER_ASSIGNED"',`
save('ride_id',d.trip.trip_id);
const detail=await api('GET','/api/bookings/'+v('booking_id')+'/trip',v('token'));
await inbox(v('token'),'DriverAssigned',d.trip.trip_id);verify('Customer nhận đúng tài xế',detail.driver.uid===v('driver_id'));
`,"const offers=await api('GET','/api/drivers/offers',v('driver_token'));verify('Offer thuộc tài xế',offers.offers.some(b=>b.booking_id===v('booking_id')));",35,'Send nhận chuyến; script kiểm tra offer và thông tin customer nhận được.','Trip gán tài xế; customer có DriverAssigned.','URL accept nghiệp vụ; script phụ cũng đi qua Gateway.');
add(17,'Cập nhật trạng thái chuyến','PATCH','/api/trips/{{ride_id}}/status','driver_token',{status:'done'},200,'d.trip.status === "COMPLETED"',null,`
await api('PATCH','/api/trips/'+v('ride_id')+'/status',v('driver_token'),{status:'start'});
await api('PATCH','/api/trips/'+v('ride_id')+'/location',v('driver_token'),{lat:${latitude+0.01},lng:${longitude+0.01}});
`,25,'Pre-request gửi start và vị trí; request chính gửi done.','DRIVER_ASSIGNED → IN_PROGRESS → COMPLETED, không được bỏ qua start.','Chỉ hai lần đổi trạng thái, thêm một lần cập nhật vị trí khi đang chạy.');
add(18,'Hủy chuyến','POST','/api/trips/{{cancel_ride_id}}/cancel','token',{reason:'Ban'},200,'d.trip.status === "CANCELED"',`
await inbox(v('token'),'TripCanceled',v('cancel_ride_id'));await inbox(v('driver_token'),'TripCanceled',v('cancel_ride_id'));
verify('Lưu lý do hủy',d.trip.cancel_reason==='Ban');
`,`
const b=await api('POST','/api/bookings',v('token'),${JSON.stringify(booking)},201);
const t=await api('POST','/api/bookings/'+b.booking.booking_id+'/accept',v('driver_token'));
save('cancel_ride_id',t.trip.trip_id);
`,30,'Pre-request tạo chuyến riêng bằng API đặt/nhận; Send hủy chuyến đó.','CANCELED, có lý do và thông báo hai bên.','Không hủy chuyến đã COMPLETED; không dùng endpoint điều phối.');
const pay=add(19,'Thanh toán online','POST','/api/payments/online','token',{trip:'{{ride_id}}'},200,'d.payment.status === "PENDING"',`
save('payment_id',d.payment.payment_id);save('payment_response',JSON.stringify(d));
const callback=await api('POST','/api/payments/'+d.payment.payment_id+'/callback',v('admin_token'),{status:'SUCCESS'});
const trip=await api('GET','/api/trips/'+v('ride_id'),v('token'));
verify('Callback COMPLETED và trip PAID',callback.payment.status==='COMPLETED' && trip.trip.payment_status==='PAID');
`,null,40,'Send tạo PENDING; Tests gọi callback mô phỏng và đọc lại trip.','Request online PENDING; callback COMPLETED; trip PAID.','Chỉ provider là mock ở API demo đã có; không đổi URL payment online.');
pay.request.header.push({key:'Idempotency-Key',value:'pay1'});
add(20,'Đánh giá chuyến đi','POST','/api/trips/{{ride_id}}/rating','token',{stars:5,comment:'Tot'},201,'d.rating.stars === 5 && d.rating.trip_id === v("ride_id")',null,null,20,'Send đánh giá chuyến đã hoàn tất.','Rating 5 sao liên kết đúng trip.','API rating thật, mỗi chuyến chỉ được đánh giá một lần.');
add(21,'Đăng ký tài xế','POST','/api/drivers/register','new_driver_token',{license:'L11',plate:'P11'},201,'d.driver.approval_status === "PENDING_APPROVAL" && d.driver.phone_verified',"save('new_driver_id',d.driver.uid);",`
const u=await api('POST','/api/register',null,{user:'tx11',pass:${JSON.stringify(passwords.DRIVER)},role:'DRIVER'},201);
const login=await api('POST','/api/login',null,{user:u.username,pass:${JSON.stringify(passwords.DRIVER)}});save('new_driver_token',login.token);
const otp = await api('POST','/api/otp/request',login.token,{phone:'0901234567'},201);
await api('POST','/api/otp/verify',login.token,{code:otp.code});
`,40,'Pre-request đăng ký/login/OTP; Send gửi hồ sơ qua API drivers/register.','Hồ sơ PENDING_APPROVAL, điện thoại đã xác thực.','OTP: response.code chỉ trong local; không đổi endpoint đăng ký tài xế.');
add(22,'Duyệt hồ sơ tài xế','PATCH','/api/drivers/{{new_driver_id}}/approve','admin_token',{approve:true},200,'d.driver.approval_status === "ACTIVE"',"await inbox(v('new_driver_token'),'DriverApprovalChanged',v('new_driver_id'));",`
await api('GET','/api/drivers/pending?limit=100&page=1',v('admin_token'));
await api('GET','/api/drivers/'+v('new_driver_id'),v('admin_token'));
`,25,'Script xem pending/chi tiết; Send duyệt bằng API Admin.','Driver ACTIVE và nhận kết quả.','Đúng PATCH endpoint approve; JWT Admin được kiểm tra.');
add(23,'Bật/tắt trạng thái nhận chuyến','PATCH','/api/drivers/availability','new_driver_token',{online:true,lat:latitude+0.02,lng:longitude},200,'d.driver.availability === "AVAILABLE"',`
const off=await api('PATCH','/api/drivers/availability',v('new_driver_token'),{online:false});verify('Tắt nhận chuyến',off.driver.availability==='OFFLINE');
`,null,20,'Send bật AVAILABLE; Tests gửi cùng API để tắt OFFLINE.','Hai trạng thái được cập nhật thật vào DB/Redis.','Không đổi token/body bằng tay, xem cả hai kết quả trong Tests.');
add(24,'Data encryption at rest','GET','/api/customers/{{customer_id}}','token',undefined,200,'d.customer.uid === v("customer_id")',null,null,40,'Send xem hồ sơ; chạy npm.cmd run demo:at-rest để kiểm tra DB.','DB lưu bcrypt/AES-GCM; key được inject từ environment.','GET profile trả dữ liệu đã giải mã, không tự chứng minh at rest; lệnh DB là bằng chứng.');
add(25,'SQL injection attempt','POST','/api/login',null,{user:"' OR 1=1 --",pass:'anything'},401,'!d.token',null,null,20,'Send payload SQL injection có sẵn.','401, không token hay dữ liệu DB.','Truy vấn parameterized của API login thật.');
add(26,'XSS input test','PUT','/api/customers/{{customer_id}}','admin_token',{fullname:"<script>alert('hack')</script>"},200,'d.customer.fullname === "&lt;script&gt;alert(&#x27;hack&#x27;)&lt;/script&gt;"',null,null,25,'Send script vào fullname.','Output escape, không trả thẻ script thô.','Đây là API cập nhật profile nghiệp vụ.');
const jwt=add(27,'JWT tampering','GET','/api/drivers/pending',null,undefined,401,'!d.drivers',null,null,20,'Send token đã sửa sub/role, signature sai có sẵn.','401, không truy cập Admin.','Token âm tính hardcode; verify signature chạy thật.');
jwt.request.auth={type:'bearer',bearer:[{key:'token',value:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbl8wMDEiLCJyb2xlIjoiQURNSU4iLCJpc3MiOiJjYWItYXV0aCIsImV4cCI6NDEwMjQ0NDgwMH0.dGFtcGVyZWQtc2lnbmF0dXJl',type:'string'}]};
add(28,'Unauthorized API access','GET','/api/drivers/{{driver_id}}','token',undefined,403,'!d.driver',null,null,20,'Send bằng token Customer.','403 Forbidden, không lộ driver.','Không thay token để làm đẹp kết quả.');
const rate=add(29,'Rate limit attack','POST','/api/bookings','token',{from_lat:999,from_lng:999},400,'!d.booking',null,null,40,'Send body invalid; Tests gửi thêm 30 POST cùng URL với header demo.','Có 429 thật sau 20 request/10s; không tạo booking rác.','Ngưỡng local riêng, không chứng minh tải 1000/s. Header demo không hoạt động khi tắt SMOKE_MODE.');
rate.request.header.push({key:'Limit',value:'1'});
rate.event[0].script.exec=script(`
verify('HTTP 400 hoặc 429 thật',[400,429].includes(pm.response.code));let blocked=pm.response.code===429?1:0;
await Promise.all(Array.from({length:30},()=>new Promise((resolve,reject)=>pm.sendRequest({url:pm.environment.get('base_url')+'/api/bookings',method:'POST',header:{'Content-Type':'application/json',Authorization:'Bearer '+v('token'),'Limit':'1'},body:{mode:'raw',raw:'{"from_lat":999,"from_lng":999}'}},(e,r)=>{if(e)return reject(e);if(![400,429].includes(r.code))return reject(new Error('Unexpected HTTP '+r.code));if(r.code===429)blocked++;resolve();}))));
verify('Nhận 429 khi vượt ngưỡng demo',blocked>0);
`);
const replay=add(30,'Replay attack (idempotency)','POST','/api/payments/online','token',{trip:'{{ride_id}}'},200,'d.payment.payment_id === v("payment_id")',"pm.test('Response cũ, không double charge',()=>pm.expect(d).to.eql(JSON.parse(v('payment_response'))));",null,30,'Send hai lần cùng body và key có sẵn.','Cùng payment_id và đúng response gốc.','Snapshot gốc PENDING khác trạng thái hiện tại đã settlement; không tạo payment mới.');
replay.request.header.push({key:'Idempotency-Key',value:'pay1'});
const total=steps.reduce((sum,s)=>sum+s.seconds,0);
const table=['| STT | Request | Giây |','|---|---|---:|',...steps.map(s=>`| ${s.n} | ${s.item.name} | ${s.seconds} |`)];
const notes='1 (30s): mở source và sơ đồ.\n2 (30s): GitHub .gitignore/.env.\n3 (30s): Gateway JWT/RBAC/routing.\n4 (30s): gRPC và Kafka.\n5 (30s): docker compose ps.\n7 (30s): Kafka UI localhost:8081.\n8 (30s): gRPC ports không publish, request đi qua Gateway.\nTổng 210s. Các phần trình bày cần người chấm đánh giá.';
const collection={info:{_postman_id:'68689e49-129d-4ce4-933b-a7f2e6ca0020',name:'CAB - Demo 20 phút - API nghiệp vụ',schema:'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  description:`23 request chính dùng API nghiệp vụ đã có. Scripts phụ dùng pm.sendRequest qua cùng Gateway, không endpoint điều phối. Chỉ OTP và provider được mô phỏng. Mục 24 kèm lệnh DB; mục 29 ngưỡng demo 20/10s, không chứng minh 1000/s.\n\n${table.join('\n')}\n\nPostman ${total}s + trình bày 210s = ${total+210}s; dự phòng ${1200-total-210}s. Đây là ngân sách thao tác, không tự đảm bảo điểm của giảng viên.`},
  variable:['admin_token','driver_token','driver_id','username','token','customer_id','booking_id','ride_id','cancel_ride_id','payment_id','payment_response','new_driver_id','new_driver_token'].map(key=>({key,value:'',type:'string'})),
  item:[{name:'Thực hành 1',item:steps.filter(s=>s.n<=20).map(s=>s.item)},{name:'Thực hành 2',item:steps.filter(s=>s.n>=21&&s.n<=23).map(s=>s.item)},
    {name:'Thực hành 3',item:steps.filter(s=>s.n>=24).map(s=>s.item)},{name:'Ghi chú ngoài Postman',description:notes,item:[]}]};
const environment={id:'823bdf70-b1d9-4259-9b25-2fe452b30020',name:'CAB - Demo 20 phút',_postman_variable_scope:'environment',values:[{key:'base_url',value:'http://localhost:8080',type:'default',enabled:true}]};
fs.writeFileSync(path.join(output,'collection.json'),JSON.stringify(collection,null,2)+'\n');
fs.writeFileSync(path.join(output,'environment.json'),JSON.stringify(environment,null,2)+'\n');
fs.writeFileSync(path.join(output,'README.md'),[
'# Demo 20 phút — API nghiệp vụ',
'Trước lượt chấm mới: đặt `SMOKE_MODE=true`, `SEED_DEMO_PASSWORD=` trong `.env`, chạy `docker compose up --build -d`, rồi `npm.cmd run demo:reset`. Reset tự sao lưu, dọn dữ liệu dư và đưa mã mẫu về c1–c5, d1–d10, b1–b5.',
'Import **collection.json + environment.json**, chọn Environment **CAB - Demo 20 phút**, Send từ bước 06 theo thứ tự. Có 23 request chính qua URL `/api/...`; scripts tự gọi bước phụ qua Gateway. Environment chỉ có base_url, không cần sửa token/ID/body. Xem [bảng gõ tay](../TYPING.md) và [dữ liệu mẫu](../DATA.md).',
`Seed: ad/${passwords.ADMIN}, kh0–kh4/${passwords.CUSTOMER}, tx1–tx10/${passwords.DRIVER}. Bước 09 tạo kh5, bước 21 tạo tx11; giữ mật khẩu theo vai trò. Họ tên An, địa chỉ seed HN; bằng lái L1–L11, biển số P1–P11.`,
'Input ngắn: `user/pass`, `license/plate`, `lat/lng`, `from_lat/from_lng`, `to_lat/to_lng`, `trip`. Response giữ tên đầy đủ. Trạng thái nhập `start → done` vẫn phải đúng thứ tự; status cuối trả COMPLETED.',
'Ngay sau reset: customer mới c6, driver mới d11, booking mới b6. Bước 10 tạo/hủy b6–b10 nên bước 15 dùng b11/t1; bước 18 tạo b12/t2 để hủy với lý do Ban. Bước 19 dùng payment p1, key pay1; bước 20 nhận xét Tot. OTP: response.code và điện thoại 0901234567 chỉ dùng local.',
table.join('\n'),
`**${total}s Postman + 210s ngoài Postman = ${total+210}s; dự phòng ${1200-total-210}s trong 20 phút.** Đây là ngân sách thao tác, phụ thuộc tốc độ giải thích và kiểm tra.`,
'**19:** request online trả PENDING; scripts gọi callback local `/api/payments/{id}/callback` bằng token Admin và kiểm tra COMPLETED/PAID. **24:** chạy `npm.cmd run demo:at-rest` để xem bằng chứng DB; GET profile không chứng minh mã hóa at rest. **29:** header `Limit: 1` dùng ngưỡng local 20/10s, không chứng minh tải 1000/s.',
'**30:** gửi lại đúng body và key pay1 của bước 19; response gốc PENDING giữ nguyên dù payment đã COMPLETED. Chỉ lặp riêng bước 29/30. Muốn chạy lại toàn luồng phải `npm.cmd run demo:reset`, rồi bắt đầu bước 06; kh5/tx11 và pay1 không được dùng lại cho một giao dịch khác trước reset. Tắt chế độ demo bằng SMOKE_MODE=false rồi tạo lại stack.'
].join('\n\n')+'\n');
console.log(`Built ${steps.length} business-API requests; ${total+210}s budget, ${1200-total-210}s reserve.`);
