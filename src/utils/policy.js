
function allowRoles(user, allowedRoles) {
  if (!user) {
    return {
      allow: false,
      reason: 'Pengguna belum terautentikasi'
    };
  }

  if (!allowedRoles.includes(user.role)) {
    return {
      allow: false,
      reason: 'Role tidak memiliki izin untuk endpoint ini'
    };
  }

  return {
    allow: true,
    reason: 'Role diizinkan'
  };
}

module.exports = { allowRoles };
