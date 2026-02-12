void main() {
    int i;
    
    // 1. Buffered Drawing Demo
    ClearScreen();
    // Rectangle, Circle, Line in buffered mode (type bit 6 = 0)
    Rectangle(10, 5, 50, 25, 1);
    Circle(80, 15, 10, 0, 1);
    Line(10, 30, 150, 30, 1);
    TextOut(2, 35, "Buffered: Press key", 1);
    
    // Nothing should be visible yet because we haven't called Refresh()
    getchar();
    
    Refresh(); // Show the buffered graphics
    TextOut(2, 45, "Refreshed!", 1);
    Refresh();
    getchar();

    // 2. Direct Drawing Demo
    ClearScreen();
    Refresh();
    TextOut(2, 0, "Direct Drawing...", 1);
    Refresh();
    
    // Ellipse and points in direct mode (type bit 6 = 1)
    // type = 1 | 0x40 = 0x41 (65)
    Ellipse(80, 30, 30, 15, 0, 65);
    Point(40, 30, 65);
    Point(45, 30, 65);
    Point(50, 30, 65);
    
    TextOut(2, 50, "Direct: Immed visible", 0x41);
    getchar();

    // 3. Text Modes Demo
    ClearScreen();
    TextOut(2, 0, "Small Font", 1);
    TextOut(2, 10, "Large Font", 0x81); // bit 7 = 1
    TextOut(2, 30, "Reverse Small", 9);   // bit 3 = 1
    TextOut(2, 40, "Reverse Large", 0x89); // bit 7=1, bit 3=1
    Refresh();
    getchar();

    // 4. Interaction Demo (XOR/Clear)
    ClearScreen();
    Block(20, 10, 100, 40, 1); // Solid block
    Refresh();
    getchar();
    
    // Draw an XORed circle over it (type=2)
    Circle(60, 25, 15, 1, 2);
    Refresh();
    getchar();
    
    // Clear a portion using type=0
    Box(40, 15, 80, 35, 1, 0); 
    Refresh();
    getchar();

    // 5. Animation Demo
    for (i = 0; i < 140; i += 4) {
        ClearScreen();
        Circle(i + 10, 30, 8, 1, 1);
        TextOut(2, 0, "Animation Demo", 1);
        Refresh();
        Delay(50);
    }
    
    TextOut(2, 50, "Demo Finished!", 1);
    Refresh();
    getchar();
}
