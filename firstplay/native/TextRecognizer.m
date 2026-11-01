#import <Foundation/Foundation.h>
#import <Vision/Vision.h>
#import <ImageIO/ImageIO.h>
#import <AppKit/AppKit.h>

static NSDictionary *Recognize(NSString *path) {
    NSURL *url = [NSURL fileURLWithPath:path];
    CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)url, NULL);
    if (!source) return nil;
    NSDictionary *properties = CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source, 0, NULL));
    CFRelease(source);
    NSInteger width = [properties[(__bridge NSString *)kCGImagePropertyPixelWidth] integerValue];
    NSInteger height = [properties[(__bridge NSString *)kCGImagePropertyPixelHeight] integerValue];
    if (width < 64 || height < 64 || width > 8000000 / height) return nil;
    VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] init];
    request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
    request.usesLanguageCorrection = NO;
    request.recognitionLanguages = @[@"en-US"];
    request.minimumTextHeight = 0.009;
    request.preferBackgroundProcessing = YES;
    VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithURL:url options:@{}];
    NSError *error = nil;
    if (![handler performRequests:@[request] error:&error]) return nil;
    NSMutableArray *lines = [NSMutableArray array];
    for (VNRecognizedTextObservation *observation in request.results) {
        VNRecognizedText *text = [[observation topCandidates:1] firstObject];
        if (!text || text.string.length > 500) continue;
        CGRect box = observation.boundingBox;
        [lines addObject:@{@"text":text.string, @"confidence":@(text.confidence),
            @"bounds":@[@(box.origin.x), @(MAX(0, 1-CGRectGetMaxY(box))), @(box.size.width), @(box.size.height)]}];
        if (lines.count == 200) break;
    }
    return @{@"width":@(width), @"height":@(height), @"lines":lines};
}

static void DrawText(NSString *text, CGFloat x, CGFloat y, CGFloat size) {
    [text drawAtPoint:NSMakePoint(x, 720-y-size) withAttributes:@{
        NSFontAttributeName:[NSFont monospacedSystemFontOfSize:size weight:NSFontWeightRegular],
        NSForegroundColorAttributeName:[NSColor whiteColor]}];
}

// Original text/UI fixtures. These contain no third-party gameplay imagery.
static BOOL Fixtures(NSString *directory) {
    if (![[NSFileManager defaultManager] createDirectoryAtPath:directory withIntermediateDirectories:YES attributes:nil error:NULL]) return NO;
    for (NSString *kind in @[@"positive", @"chat-only", @"wrong-item", @"no-properties", @"blueprints", @"world", @"creepvine", @"world-no-hud", @"ingredient"]) for (NSString *suffix in @[@"a", @"b"]) {
        NSImage *image = [[NSImage alloc] initWithSize:NSMakeSize(1280, 720)];
        [image lockFocus];
        [[NSColor colorWithCalibratedRed:.03 green:.08 blue:.12 alpha:1] setFill];
        NSRectFill(NSMakeRect(0,0,1280,720));
        DrawText(@"FirstPlay ORIGINAL OCR TEST - not gameplay",45,30,20);
        NSString *fixture = [NSString stringWithFormat:@"%@-%@",kind,suffix];
        DrawText(fixture,[suffix isEqualToString:@"b"]?80:45,650,18);
        if ([kind isEqualToString:@"chat-only"]) {
            DrawText(@"COMMUNITY CHAT",180,100,26);
            DrawText(@"viewer: Boomerang",200,240,26);
            DrawText(@"viewer: FOOD H2O INVENTORY",200,280,26);
        } else if ([kind isEqualToString:@"blueprints"]) {
            DrawText(@"BLUEPRINTS",180,110,30); DrawText(@"Scanner",230,240,26);
            DrawText(@"Repair Tool",230,310,26); DrawText(@"Seaglide",230,380,26);
        } else if ([kind isEqualToString:@"world"] || [kind isEqualToString:@"creepvine"] || [kind isEqualToString:@"world-no-hud"]) {
            DrawText([kind isEqualToString:@"creepvine"] ? @"Creepvine" : @"Writhing Weed",575,320,26); DrawText(@"Pick up",575,370,26); if (![kind isEqualToString:@"world-no-hud"]) DrawText(@"O2 45",100,560,26);
        } else if ([kind isEqualToString:@"ingredient"]) {
            DrawText(@"BLUEPRINTS",180,110,30); DrawText(@"Flare",575,240,26); DrawText(@"Cave Sulfur",575,310,26);
        } else {
            DrawText(@"INVENTORY",180,110,30); DrawText(@"STORAGE",740,110,30);
            [[NSColor colorWithCalibratedWhite:.18 alpha:1] setFill]; NSRectFill(NSMakeRect(205,300,390,200));
            DrawText([kind isEqualToString:@"wrong-item"]?@"Peeper":@"Boomerang",230,240,26);
            if (![kind isEqualToString:@"no-properties"]) {
                DrawText(@"FOOD: +8",230,280,22); DrawText(@"H2O: -3",230,315,22);
                DrawText(@"Small, edible prey fish.",230,350,22);
            }
        }
        [image unlockFocus];
        NSBitmapImageRep *bitmap = [NSBitmapImageRep imageRepWithData:image.TIFFRepresentation];
        NSData *data = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
        NSString *path = [directory stringByAppendingPathComponent:[fixture stringByAppendingString:@".png"]];
        if (!data || ![data writeToFile:path atomically:YES]) return NO;
    }
    return YES;
}

int main(int argc, const char *argv[]) {
    @autoreleasepool { @try {
        if (argc != 3) { fputs("Provide two image paths.\n",stderr); return 1; }
        if (!strcmp(argv[1],"--fixtures")) {
            if (!Fixtures([NSString stringWithUTF8String:argv[2]])) return 1;
            puts("{\"fixtures\":18}"); return 0;
        }
        NSDictionary *first = Recognize([NSString stringWithUTF8String:argv[1]]);
        NSDictionary *second = Recognize([NSString stringWithUTF8String:argv[2]]);
        if (!first || !second) { fputs("Local text recognition failed.\n",stderr); return 1; }
        NSData *data = [NSJSONSerialization dataWithJSONObject:@[first,second] options:0 error:NULL];
        if (!data) return 1;
        fwrite(data.bytes,1,data.length,stdout); putchar('\n'); return 0;
    } @catch (NSException *exception) { fputs("Local text recognition failed.\n",stderr); return 1; } }
}
