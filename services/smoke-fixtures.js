// Dedicated local demo identities. Never used unless SMOKE_MODE=true.
const passwords = {
  ADMIN: 'adminpassword',
  CUSTOMER: 'customerpassword',
  DRIVER: 'driverpassword',
};
const customers = Array.from({ length: 5 }, (_, i) => ({
  uid: `c${i + 1}`, username: `kh${i}`, role: 'CUSTOMER',
}));
const nearbyOffsets = [[0.0005, 0.0003], [0.001, -0.001], [-0.002, 0.0015], [0.003, 0.002], [-0.004, -0.003]];
module.exports = {
  passwords, latitude: 22, longitude: 111,
  admin: { uid: 'a1', username: 'ad', role: 'ADMIN' },
  customer: customers[0], customers,
  drivers: Array.from({ length: 10 }, (_, i) => ({ uid: `d${i + 1}`, username: `tx${i + 1}`, role: 'DRIVER',
    latitude: 22 + (i < 5 ? nearbyOffsets[i][0] : 0.02 + (i - 5) * 0.005),
    longitude: 111 + (i < 5 ? nearbyOffsets[i][1] : 0.02 + (i - 5) * 0.005),
    approval: ['ACTIVE', 'ACTIVE', 'PENDING_APPROVAL', 'REJECTED', 'ACTIVE'][i % 5],
    availability: i < 2 ? 'AVAILABLE' : 'OFFLINE' })),
};
