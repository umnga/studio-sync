import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { AudioWaveform, Mic, Guitar, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Layout } from "@/components/Layout";
import { FeatureCard } from "@/components/FeatureCard";
import { WaveformVisualizer } from "@/components/WaveformVisualizer";

const features = [
  {
    icon: AudioWaveform,
    title: "Audio Splitter",
    description: "Isolate vocals, drums, bass, and guitar from any song using advanced AI stem separation technology.",
    link: "/audio-splitter",
  },
  {
    icon: Mic,
    title: "Buzz Detector",
    description: "Get real-time feedback on your strumming technique. Detect unwanted buzzes and muted strings instantly.",
    link: "/practice-tools",
  },
  {
    icon: Guitar,
    title: "Chord Converter",
    description: "Convert your guitar strumming patterns to keyboard chords instantly for multi-instrument practice.",
    link: "/practice-tools",
  },
];

const Index = () => {
  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
        </div>

        <div className="container mx-auto px-4 py-20 md:py-32">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mb-6"
            >
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card text-sm text-primary">
                <Sparkles className="h-4 w-4" />
                AI-Powered Music Tools
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.6 }}
              className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight"
            >
              Your{" "}
              <span className="gradient-text">AI-Powered</span>
              <br />
              Music Practice Companion
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto"
            >
              Elevate your practice sessions with cutting-edge audio tools. 
              Split stems, detect technique issues, and convert instruments seamlessly.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <Link to="/audio-splitter">
                <Button size="lg" className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-white px-8 glow-effect">
                  Get Started
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link to="/about">
                <Button size="lg" variant="outline" className="border-border hover:bg-muted/50">
                  Learn More
                </Button>
              </Link>
            </motion.div>

            {/* Animated Waveform */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.8 }}
              className="mt-16"
            >
              <WaveformVisualizer isActive={true} barCount={48} className="h-24" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 relative">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Powerful <span className="gradient-text">Practice Tools</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Everything you need to take your music practice to the next level
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {features.map((feature, index) => (
              <FeatureCard
                key={feature.title}
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
                link={feature.link}
                delay={index * 0.1}
              />
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="glass-card rounded-2xl p-8 md:p-12 text-center max-w-4xl mx-auto relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-secondary/10 -z-10" />
            
            <h3 className="text-2xl md:text-3xl font-bold mb-4">
              Ready to Transform Your Practice?
            </h3>
            <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
              Start using our AI-powered tools today and see the difference in your musical journey.
            </p>
            
            <div className="flex flex-wrap gap-4 justify-center">
              <Link to="/audio-splitter">
                <Button className="bg-gradient-to-r from-primary to-secondary hover:opacity-90">
                  <AudioWaveform className="mr-2 h-4 w-4" />
                  Try Audio Splitter
                </Button>
              </Link>
              <Link to="/practice-tools">
                <Button variant="outline" className="border-border hover:bg-muted/50">
                  <Mic className="mr-2 h-4 w-4" />
                  Explore Practice Tools
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
};

export default Index;
