import { useState } from "react";
import { motion } from "framer-motion";
import { Layout } from "@/components/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mic, Guitar, Radio } from "lucide-react";
import { BuzzDetector } from "@/components/tools/BuzzDetector";
import { ChordConverter } from "@/components/tools/ChordConverter";
import { Tuner } from "@/components/tools/Tuner";

const PracticeTools = () => {
  const [activeTab, setActiveTab] = useState("buzz-detector");

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-5xl mx-auto"
        >
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">
              Practice <span className="gradient-text">Tools</span>
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Real-time audio analysis tools to help you perfect your technique
            </p>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-3 w-full max-w-lg mx-auto mb-8 bg-card/50 p-1 rounded-xl">
              <TabsTrigger 
                value="buzz-detector" 
                className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-secondary data-[state=active]:text-white rounded-lg"
              >
                <Mic className="h-4 w-4" />
                <span className="hidden sm:inline">Buzz Detector</span>
              </TabsTrigger>
              <TabsTrigger 
                value="chord-converter"
                className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-secondary data-[state=active]:text-white rounded-lg"
              >
                <Guitar className="h-4 w-4" />
                <span className="hidden sm:inline">Chord Converter</span>
              </TabsTrigger>
              <TabsTrigger 
                value="tuner"
                className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-secondary data-[state=active]:text-white rounded-lg"
              >
                <Radio className="h-4 w-4" />
                <span className="hidden sm:inline">Tuner</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="buzz-detector">
              <BuzzDetector />
            </TabsContent>

            <TabsContent value="chord-converter">
              <ChordConverter />
            </TabsContent>

            <TabsContent value="tuner">
              <Tuner />
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </Layout>
  );
};

export default PracticeTools;
