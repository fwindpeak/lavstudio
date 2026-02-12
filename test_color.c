void main() {
    SetGraphMode(8);
    for (int i = 0; i < 256; i++) {
        SetFgColor(i);
        // Draw a 10x5 box for each color index
        Block((i % 16) * 10, (i / 16) * 5, (i % 16) * 10 + 9, (i / 16) * 5 + 4, 1);
    }
    Refresh();
    printf("Color Test Done");
    getchar();
}
