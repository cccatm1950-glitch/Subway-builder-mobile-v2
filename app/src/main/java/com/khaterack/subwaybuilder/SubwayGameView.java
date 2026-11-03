
package com.khaterack.subwaybuilder;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PointF;
import android.view.MotionEvent;
import android.view.View;
import java.util.ArrayList;

public class SubwayGameView extends View {

    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final ArrayList<PointF> stations = new ArrayList<>();

    private int money = 500;
    private int passengers = 0;
    private int trains = 0;

    public SubwayGameView(Context context) {
        super(context);
        setFocusable(true);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);

        float w = getWidth();
        float h = getHeight();

        // City background
        canvas.drawColor(Color.rgb(220, 225, 215));

        // City blocks
        paint.setColor(Color.rgb(195, 205, 190));
        for (int x = 20; x < w; x += 100) {
            for (int y = 120; y < h; y += 85) {
                canvas.drawRect(x, y, x + 65, y + 50, paint);
            }
        }

        // River
        paint.setColor(Color.rgb(100, 175, 210));
        Path river = new Path();
        river.moveTo(0, h * 0.65f);
        river.quadTo(w * 0.4f, h * 0.45f, w, h * 0.7f);
        river.lineTo(w, h * 0.85f);
        river.quadTo(w * 0.4f, h * 0.6f, 0, h * 0.8f);
        river.close();
        canvas.drawPath(river, paint);

        // Subway line
        paint.setColor(Color.rgb(220, 55, 65));
        paint.setStrokeWidth(9);
        paint.setStrokeCap(Paint.Cap.ROUND);

        for (int i = 1; i < stations.size(); i++) {
            PointF a = stations.get(i - 1);
            PointF b = stations.get(i);
            canvas.drawLine(a.x, a.y, b.x, b.y, paint);
        }

        // Stations
        for (PointF station : stations) {
            paint.setColor(Color.WHITE);
            canvas.drawCircle(station.x, station.y, 15, paint);
            paint.setColor(Color.rgb(40, 45, 55));
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(5);
            canvas.drawCircle(station.x, station.y, 15, paint);
            paint.setStyle(Paint.Style.FILL);
        }

        // Top information panel
        paint.setColor(Color.rgb(30, 35, 50));
        canvas.drawRect(0, 0, w, 105, paint);

        paint.setColor(Color.WHITE);
        paint.setTextSize(25);
        canvas.drawText("SUBWAY BUILDER", 20, 35, paint);

        paint.setTextSize(19);
        canvas.drawText("Money: $" + money, 20, 75, paint);
        canvas.drawText("Passengers: " + passengers, 190, 75, paint);
        canvas.drawText("Stations: " + stations.size(), 390, 75, paint);

        // Send train button
        paint.setColor(Color.rgb(35, 150, 95));
        canvas.drawRoundRect(w - 180, 15, w - 15, 85, 15, 15, paint);

        paint.setColor(Color.WHITE);
        paint.setTextSize(20);
        canvas.drawText("SEND TRAIN", w - 160, 57, paint);

        // Instructions
        paint.setColor(Color.rgb(30, 35, 50));
        paint.setTextSize(17);
        canvas.drawText("Tap the map to build stations. Connect them into a subway line.",
                20, h - 20, paint);
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (event.getAction() != MotionEvent.ACTION_UP) {
            return true;
        }

        float x = event.getX();
        float y = event.getY();
        float w = getWidth();

        // Send train button
        if (y < 105 && x > w - 190) {
            if (stations.size() >= 2) {
                trains++;
                passengers += stations.size() * 10;
                money += stations.size() * 50;
            }
            invalidate();
            return true;
        }

        // Add a station
        if (y > 110 && y < getHeight() - 35 && money >= 100) {
            stations.add(new PointF(x, y));
            money -= 100;
            invalidate();
        }

        return true;
    }
}
