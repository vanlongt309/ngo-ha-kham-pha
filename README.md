# Ngộ Không Khám Phá

Game 3D khám phá một người chơi bằng Three.js. Điều khiển Leo tự do dạo bước trong map sơn môn Vân Sơn.

**Chơi game:** <https://vanlongt309.github.io/ngo-ha-kham-pha/>

## Điều khiển

- **WASD / phím mũi tên:** di chuyển; **Shift:** chạy nhanh; **Space:** nhảy.
- **Chuột:** xoay góc nhìn sau khi click vào game; **Esc:** tạm dừng.
- Trên điện thoại: dùng cần joystick bên trái để di chuyển và kéo bên phải để xoay góc nhìn; chạm nút nhảy.

## Chạy và build

Yêu cầu Node.js 22 và pnpm 10.18.0.

```bash
pnpm install
pnpm typecheck
pnpm test
VITE_GITHUB_PAGES=true pnpm manus:build-source
pnpm exec vite preview --host 0.0.0.0
```

Build tạo game tĩnh trong `dist/`. Model nhân vật Leo có animation `idle`/`walk`, shrine và biểu tượng cần thiết được đóng gói trong `public/game-assets/`, nên bản GitHub Pages không phụ thuộc Manus Storage cho nhân vật. GitHub Actions tự chạy kiểm tra, build và deploy khi có commit mới vào `main`.

## Công nghệ và giấy phép

Game dùng Three.js, Rapier, TypeScript và Vite. Font CC0 kèm giấy phép tại `public/fonts/ManusCC0-LICENSE.txt`. Xem giấy phép của từng thư viện trong kho tương ứng.
